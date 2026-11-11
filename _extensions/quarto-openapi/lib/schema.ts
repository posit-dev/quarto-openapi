/**
 * Convert OpenAPI Schema objects to markdown property tables.
 *
 * Handles: primitives, objects (including nested via flattened rows),
 * arrays, allOf composition, and property attributes.
 */

import type { Schema, Reference } from "./types.ts";
import { isReference } from "./types.ts";
import type { OpenAPISpec } from "./types.ts";
import { resolve } from "./refs.ts";
import { fieldTable, type FieldRow } from "./fields.ts";

/**
 * Render a schema as markdown lines (description + property table).
 */
export function renderSchema(
  spec: OpenAPISpec,
  schema: Schema | Reference,
): string[] {
  const resolved = isReference(schema) ? resolve<Schema>(spec, schema) : schema;
  const lines: string[] = [];

  if (resolved.description) {
    lines.push(resolved.description);
    lines.push("");
  }

  if (resolved.allOf) {
    return renderAllOf(spec, resolved, lines);
  }

  const type = resolved.type;

  if (type === "array") {
    return renderArray(spec, resolved, lines);
  }

  if (
    !resolved.properties &&
    resolved.additionalProperties !== undefined &&
    resolved.additionalProperties !== false
  ) {
    return renderMap(spec, resolved, lines);
  }

  if (type === "object" || resolved.properties) {
    return renderObject(spec, resolved, lines);
  }

  // Primitive type
  if (type) {
    lines.push(formatPrimitiveType(spec, resolved));
  }

  return lines;
}

function renderAllOf(
  spec: OpenAPISpec,
  schema: Schema,
  lines: string[],
): string[] {
  // Merge all properties from allOf schemas into a single object
  const merged = mergeAllOf(spec, schema.allOf!);
  return renderObject(spec, merged, lines);
}

/**
 * Merge allOf schemas into a single schema with combined properties.
 */
function mergeAllOf(
  spec: OpenAPISpec,
  schemas: (Schema | Reference)[],
): Schema {
  const merged: Schema = { type: "object", properties: {}, required: [] };

  for (const s of schemas) {
    const resolved = isReference(s) ? resolve<Schema>(spec, s) : s;

    // Recursively merge nested allOf
    const effective =
      resolved.allOf ? mergeAllOf(spec, resolved.allOf) : resolved;

    if (effective.properties) {
      merged.properties = { ...merged.properties, ...effective.properties };
    }
    if (effective.required) {
      merged.required = [...(merged.required || []), ...effective.required];
    }
    if (effective.description && !merged.description) {
      merged.description = effective.description;
    }
  }

  return merged;
}

function renderArray(
  spec: OpenAPISpec,
  schema: Schema,
  lines: string[],
): string[] {
  if (!schema.items) {
    lines.push("Array");
    return lines;
  }

  const items = isReference(schema.items)
    ? resolve<Schema>(spec, schema.items)
    : schema.items;

  if (items.type === "object" || items.properties || items.allOf) {
    lines.push("Array of objects:");
    lines.push("");
    lines.push(...renderSchema(spec, items));
  } else {
    const itemType = formatPrimitiveType(spec, items);
    lines.push(`Array of ${itemType}`);
  }

  return lines;
}

function renderMap(
  spec: OpenAPISpec,
  schema: Schema,
  lines: string[],
): string[] {
  const ap = schema.additionalProperties!;
  if (typeof ap === "boolean") {
    if (ap === true) {
      lines.push("Map of string to any");
    }
    return lines;
  }
  const valueSchema = isReference(ap) ? resolve<Schema>(spec, ap) : ap;
  if (
    valueSchema.type === "object" ||
    valueSchema.properties ||
    valueSchema.allOf
  ) {
    lines.push("Map of string to object:");
    lines.push("");
    lines.push(...renderSchema(spec, valueSchema));
  } else {
    lines.push(`Map of string to ${formatPrimitiveType(spec, valueSchema)}`);
  }
  return lines;
}

function renderObject(
  spec: OpenAPISpec,
  schema: Schema,
  lines: string[],
): string[] {
  if (!schema.properties) {
    lines.push("Object");
    return lines;
  }

  const rows = flattenProperties(
    spec,
    schema.properties,
    schema.required,
    "",
    0,
    new Set([schema]),
  );
  lines.push(...fieldTable(rows));
  return lines;
}

/** Whether a schema describes an object whose properties can be listed. */
function isObjectLike(schema: Schema): boolean {
  return schema.type === "object" || !!schema.properties || !!schema.allOf;
}

/** The properties of an object-like schema, with `allOf` merged. */
function objectFields(spec: OpenAPISpec, schema: Schema): Schema {
  return schema.allOf ? mergeAllOf(spec, schema.allOf) : schema;
}

/**
 * Flatten object properties into rows, recursing into nested objects
 * with dotted path names.
 *
 * `ancestors` holds the schemas being expanded on the way here. A property
 * whose schema is already among them gets its own row but no child rows, so a
 * recursive schema renders once instead of forever.
 */
function flattenProperties(
  spec: OpenAPISpec,
  properties: Record<string, Schema | Reference>,
  required: string[] | undefined,
  prefix: string,
  depth: number,
  ancestors: ReadonlySet<Schema>,
): FieldRow[] {
  const rows: FieldRow[] = [];
  const requiredSet = new Set(required || []);

  /** Rows for the properties of `schema`, nested under `path`. */
  const children = (schema: Schema, path: string): FieldRow[] => {
    if (ancestors.has(schema)) return [];
    const fields = objectFields(spec, schema);
    if (!fields.properties) return [];
    return flattenProperties(
      spec,
      fields.properties,
      fields.required,
      path,
      depth + 1,
      new Set([...ancestors, schema]),
    );
  };

  for (const [name, prop] of Object.entries(properties)) {
    const resolved = isReference(prop) ? resolve<Schema>(spec, prop) : prop;
    const displayName = prefix ? `${prefix}.${name}` : name;
    const row = (type: string, attributes: string): FieldRow => ({
      name: displayName,
      depth,
      type,
      description: resolved.description?.trim() ?? "",
      attributes,
    });
    const attributes = attributesOf(resolved, requiredSet.has(name));
    const alternative = soleAlternative(spec, resolved);

    if (
      (resolved.type === "object" || resolved.properties) &&
      resolved.properties &&
      !resolved.allOf
    ) {
      // Nested object: emit a row for the object itself, then recurse
      rows.push(row("object", ""));
      rows.push(...children(resolved, displayName));
    } else if (resolved.allOf) {
      const merged = mergeAllOf(spec, resolved.allOf);
      rows.push({
        ...row("object", ""),
        description:
          (resolved.description || merged.description || "").trim(),
      });
      rows.push(...children(resolved, displayName));
    } else if (alternative && isObjectLike(alternative)) {
      // A nullable reference, `anyOf: [{ $ref }, { nullable: true }]`: list
      // the referenced object's properties as if it were a nested object.
      rows.push(row(formatTypeString(spec, resolved), attributes));
      rows.push(...children(alternative, displayName));
    } else if (resolved.type === "array" && resolved.items) {
      const items = isReference(resolved.items)
        ? resolve<Schema>(spec, resolved.items)
        : resolved.items;

      if (isObjectLike(items)) {
        rows.push(row("[object]", attributes));
        rows.push(...children(items, `${displayName}[]`));
      } else {
        rows.push(row(`[${typeLabel(spec, items)}]`, attributes));
      }
    } else if (
      !resolved.properties &&
      resolved.additionalProperties !== undefined &&
      resolved.additionalProperties !== false
    ) {
      // Typed map: additionalProperties is a schema, $ref, or `true`.
      const ap = resolved.additionalProperties;
      const valueType = mapValueTypeLabel(spec, ap);
      rows.push(row(`map[string, ${valueType}]`, attributes));
      if (ap !== true) {
        const valueSchema = isReference(ap) ? resolve<Schema>(spec, ap) : ap;
        if (isObjectLike(valueSchema)) {
          rows.push(...children(valueSchema, `${displayName}{}`));
        }
      }
    } else {
      rows.push(row(formatTypeString(spec, resolved), attributes));
    }
  }

  return rows;
}

/**
 * The attribute sentences shown after a field's description, such as
 * "Required. Example: `x`.", or "" when the field has none.
 */
function attributesOf(schema: Schema, isRequired: boolean): string {
  const attrs: string[] = [];
  if (isRequired) attrs.push("Required");
  if (schema.readOnly) attrs.push("Read-only");
  if (schema.writeOnly) attrs.push("Write-only");
  if (schema.default !== undefined)
    attrs.push(`Default: \`${formatValue(schema.default)}\``);
  if (schema.minimum !== undefined) attrs.push(`Minimum: \`${schema.minimum}\``);
  if (schema.maximum !== undefined) attrs.push(`Maximum: \`${schema.maximum}\``);
  if (schema.enum)
    attrs.push(
      `Enum: ${schema.enum.map((v) => `\`${formatValue(v)}\``).join(", ")}`,
    );
  if (schema.example !== undefined)
    attrs.push(`Example: \`${formatValue(schema.example)}\``);

  return attrs.length > 0 ? attrs.join(". ") + "." : "";
}

const semanticFormats = new Set(["date-time", "date", "time", "duration", "uuid", "uri", "uri-reference", "email", "hostname", "ipv4", "ipv6", "byte", "binary", "password"]);

function mapValueTypeLabel(
  _spec: OpenAPISpec,
  value: Schema | Reference | boolean,
): string {
  if (value === true) return "any";
  if (value === false) return "object";
  if (isReference(value)) {
    return refName(value);
  }
  if (value.type === "object" || value.properties || value.allOf) return "object";
  return value.type || "object";
}

function refName(ref: Reference): string {
  return ref.$ref.split("/").pop() || "object";
}

/**
 * Whether a schema only marks its parent as nullable, like the second member
 * of `anyOf: [{ $ref }, { nullable: true }]`.
 */
function isNullMarker(schema: Schema | Reference): boolean {
  if (isReference(schema)) return false;
  if (schema.type === "null") return true;
  return (
    schema.nullable === true &&
    Object.keys(schema).every((k) => k === "nullable" || k === "description")
  );
}

/**
 * The one schema an `anyOf` or `oneOf` allows besides null, or undefined when
 * there is no such composition or it has more than one alternative.
 */
function soleAlternative(spec: OpenAPISpec, schema: Schema): Schema | undefined {
  const members = schema.anyOf ?? schema.oneOf;
  if (!members) return undefined;
  const alternatives = members.filter((m) => !isNullMarker(m));
  if (alternatives.length !== 1) return undefined;
  const [only] = alternatives;
  return isReference(only) ? resolve<Schema>(spec, only) : only;
}

/**
 * A short name for the type a schema allows: the schema name for a `$ref`,
 * the alternatives joined by `|` for `anyOf`/`oneOf`, and `any` for a schema
 * that does not constrain the type.
 */
function typeLabel(spec: OpenAPISpec, schema: Schema | Reference): string {
  if (isReference(schema)) return refName(schema);
  if (schema.type) return schema.type;
  if (schema.allOf) {
    return schema.allOf.length === 1
      ? typeLabel(spec, schema.allOf[0])
      : "object";
  }
  const members = schema.anyOf ?? schema.oneOf;
  if (members) {
    const labels = members.map((m) =>
      isNullMarker(m) ? "null" : typeLabel(spec, m),
    );
    return [...new Set(labels)].join("|");
  }
  if (schema.properties || schema.additionalProperties) return "object";
  if (schema.items) return "array";
  return "any";
}

function formatTypeString(spec: OpenAPISpec, schema: Schema): string {
  let type = typeLabel(spec, schema);

  if (schema.format && semanticFormats.has(schema.format)) {
    type = `${type} (${schema.format})`;
  }
  if (schema.nullable && !type.split("|").includes("null")) {
    type = `${type}|null`;
  }

  return type;
}

function formatPrimitiveType(spec: OpenAPISpec, schema: Schema): string {
  const parts = [typeLabel(spec, schema)];
  if (schema.format && semanticFormats.has(schema.format)) parts.push(`(${schema.format})`);
  return parts.join(" ");
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  // Quoted, because an empty code span renders as nothing at all.
  if (typeof value === "string") return value === "" ? '""' : value;
  return JSON.stringify(value);
}
