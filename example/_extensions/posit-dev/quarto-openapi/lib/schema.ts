/**
 * Convert OpenAPI Schema objects to markdown property tables.
 *
 * Handles: primitives, objects (including nested via flattened rows),
 * arrays, maps, allOf/anyOf/oneOf composition, and property attributes.
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
  const resolved = normalize(spec, schema);
  const lines: string[] = [];

  if (resolved.description) {
    lines.push(resolved.description);
    lines.push("");
  }

  const type = resolved.type;

  if (type === "array") {
    return renderArray(spec, resolved, lines);
  }

  if (isMap(resolved)) {
    return renderMap(spec, resolved, lines);
  }

  if (type === "object" || resolved.properties) {
    return renderObject(spec, resolved, lines);
  }

  const alternatives = resolved.anyOf ?? resolved.oneOf;
  if (!type && alternatives) {
    return renderAlternatives(spec, alternatives, lines);
  }

  // Primitive type
  if (type) {
    lines.push(formatPrimitiveType(spec, resolved));
  }

  return lines;
}

/**
 * A schema with its `$ref` resolved and its `allOf` members merged into it.
 * Properties and required lists combine; for any other keyword the schema's
 * own value wins, then the first member that sets it.
 */
function normalize(spec: OpenAPISpec, schema: Schema | Reference): Schema {
  const resolved = isReference(schema) ? resolve<Schema>(spec, schema) : schema;
  if (!resolved.allOf) return resolved;

  const { allOf, ...own } = resolved;
  const merged: Record<string, unknown> & Schema = {};
  const add = (part: Schema, override: boolean) => {
    for (const [key, value] of Object.entries(part)) {
      if (key === "properties") {
        merged.properties = { ...merged.properties, ...part.properties };
      } else if (key === "required") {
        merged.required = [...(merged.required ?? []), ...part.required!];
      } else if (override || merged[key] === undefined) {
        merged[key] = value;
      }
    }
  };
  for (const member of allOf) add(normalize(spec, member), false);
  add(own, true);
  return merged;
}

/** Whether a schema is a map: `additionalProperties` and no fixed properties. */
function isMap(schema: Schema): boolean {
  return (
    !schema.properties &&
    schema.additionalProperties !== undefined &&
    schema.additionalProperties !== false
  );
}

/** Whether a schema describes an object whose properties can be listed. */
function isObjectLike(schema: Schema): boolean {
  return schema.type === "object" || !!schema.properties;
}

/**
 * Render each alternative of an `anyOf`/`oneOf` in turn, then say whether
 * `null` is also allowed.
 */
function renderAlternatives(
  spec: OpenAPISpec,
  members: (Schema | Reference)[],
  lines: string[],
): string[] {
  const alternatives = members.filter((m) => !isNullMarker(m));
  alternatives.forEach((member, i) => {
    if (i > 0) lines.push("", "Or:", "");
    lines.push(...renderSchema(spec, member));
  });
  if (alternatives.length < members.length) lines.push("", "Or `null`.");
  return lines;
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

  const items = normalize(spec, schema.items);

  if (isObjectLike(items)) {
    lines.push("Array of objects:");
    lines.push("");
    lines.push(...renderSchema(spec, items));
  } else if (!items.type && (items.anyOf || items.oneOf)) {
    lines.push("Array of:");
    lines.push("");
    lines.push(...renderSchema(spec, items));
  } else {
    lines.push(`Array of ${formatPrimitiveType(spec, items)}`);
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
  const valueSchema = normalize(spec, ap);
  if (isObjectLike(valueSchema)) {
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

  const rows = flattenProperties(spec, schema.properties, schema.required);
  lines.push(...fieldTable(rows));
  return lines;
}

/**
 * Flatten object properties into rows, recursing into nested objects
 * with dotted path names.
 */
function flattenProperties(
  spec: OpenAPISpec,
  properties: Record<string, Schema | Reference>,
  required?: string[],
  prefix: string = "",
  depth: number = 0,
): FieldRow[] {
  const rows: FieldRow[] = [];
  const requiredSet = new Set(required || []);

  for (const [name, prop] of Object.entries(properties)) {
    const schema = normalize(spec, prop);
    const path = prefix ? `${prefix}.${name}` : name;
    rows.push({
      name: path,
      depth,
      type: formatTypeString(spec, schema),
      description: schema.description ?? "",
      attributes: attributesOf(schema, requiredSet.has(name)),
    });

    const nested = nestedFields(spec, schema);
    if (nested?.fields.properties) {
      rows.push(
        ...flattenProperties(
          spec,
          nested.fields.properties,
          nested.fields.required,
          path + nested.suffix,
          depth + 1,
        ),
      );
    }
  }

  return rows;
}

/**
 * The object whose properties a field's child rows list, and the suffix its
 * child names take after the field's name: `[]` steps into array items, `{}`
 * into map values. A nullable object (`anyOf: [{ $ref }, { nullable: true }]`)
 * lists the object's properties.
 */
function nestedFields(
  spec: OpenAPISpec,
  schema: Schema,
): { fields: Schema; suffix: string } | undefined {
  if (schema.properties) return { fields: schema, suffix: "" };

  const inner =
    schema.type === "array" && schema.items
      ? { schema: schema.items, suffix: "[]" }
      : isMap(schema) && typeof schema.additionalProperties === "object"
        ? { schema: schema.additionalProperties, suffix: "{}" }
        : undefined;
  if (inner) {
    const found = nestedFields(spec, normalize(spec, inner.schema));
    return found && { ...found, suffix: inner.suffix + found.suffix };
  }

  const alternative = soleAlternative(spec, schema);
  return alternative && nestedFields(spec, alternative);
}

/**
 * The attribute sentences shown after a field's description, such as
 * "Required. Example: `x`.", or "" when the field has none.
 */
export function attributesOf(schema: Schema, isRequired: boolean): string {
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
  return alternatives.length === 1
    ? normalize(spec, alternatives[0])
    : undefined;
}

/** The last segment of a `$ref`, which names the schema it points to. */
function refName(ref: string): string {
  return ref.split("/").pop() || "object";
}

/**
 * A short name for the type a schema allows: its `type`; `[item]` for an
 * array; `map[string, value]` for a map; the alternatives joined by `|` for
 * `anyOf`/`oneOf`; the schema's name where a `$ref` would recurse; and `any`
 * for a schema that does not constrain the type.
 */
function typeLabel(spec: OpenAPISpec, schema: Schema | Reference): string {
  const s = normalize(spec, schema);
  if (s["x-circular-ref"]) return refName(s["x-circular-ref"]);
  if (s.type === "array" || (!s.type && s.items)) {
    return `[${s.items ? typeLabel(spec, s.items) : "any"}]`;
  }
  if (isMap(s)) {
    const ap = s.additionalProperties!;
    const value =
      ap === true
        ? "any"
        : isReference(ap)
          ? refName(ap.$ref)
          : typeLabel(spec, ap as Schema);
    return `map[string, ${value}]`;
  }
  if (s.type) return s.type;
  const members = s.anyOf ?? s.oneOf;
  if (members) {
    const labels = members.flatMap((m) => {
      if (isNullMarker(m)) return ["null"];
      const label = typeLabel(spec, m);
      return !isReference(m) && m.nullable ? [label, "null"] : [label];
    });
    return [...new Set(labels)].join("|");
  }
  if (s.properties) return "object";
  return "any";
}

/**
 * The type label for a field: the type, its format when the format says
 * something about the value (or any format, with `anyFormat`), and `|null`
 * when nullable.
 */
export function formatTypeString(
  spec: OpenAPISpec,
  schema: Schema,
  anyFormat = false,
): string {
  let type = typeLabel(spec, schema);

  if (schema.format && (anyFormat || semanticFormats.has(schema.format))) {
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
