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
import { gridTable, type TableRow } from "./markdown.ts";

interface PropertyRow {
  name: string;
  type: string;
  description: string;
}

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

  if (type === "object" || resolved.properties) {
    return renderObject(spec, resolved, lines);
  }

  // Primitive type
  if (type) {
    lines.push(formatPrimitiveType(resolved));
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
    const itemType = formatPrimitiveType(items);
    lines.push(`Array of ${itemType}`);
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

  const rows = flattenProperties(spec, schema.properties, schema.required, "");
  if (rows.length === 0) return lines;

  const tableRows: TableRow[] = rows.map((row) => ({
    cells: [row.name, row.type, row.description],
  }));

  lines.push(...gridTable(["Name", "Type", "Description"], tableRows));
  return lines;
}

/**
 * Flatten object properties into rows, recursing into nested objects
 * with indented dotted path names.
 */
function flattenProperties(
  spec: OpenAPISpec,
  properties: Record<string, Schema | Reference>,
  required?: string[],
  prefix: string = "",
  depth: number = 0,
): PropertyRow[] {
  const rows: PropertyRow[] = [];
  const requiredSet = new Set(required || []);

  for (const [name, prop] of Object.entries(properties)) {
    const resolved = isReference(prop) ? resolve<Schema>(spec, prop) : prop;
    const displayName = prefix ? `${prefix}.${name}` : name;
    const nameCell = depth > 0
      ? `[\`${displayName}\`]{.schema-nest-${depth}}`
      : `\`${displayName}\``;

    if (
      (resolved.type === "object" || resolved.properties) &&
      resolved.properties &&
      !resolved.allOf
    ) {
      // Nested object: emit a row for the object itself, then recurse
      rows.push({
        name: nameCell,
        type: "`object`",
        description: resolved.description || "",
      });
      rows.push(
        ...flattenProperties(
          spec,
          resolved.properties,
          resolved.required,
          displayName,
          depth + 1,
        ),
      );
    } else if (resolved.allOf) {
      const merged = mergeAllOf(spec, resolved.allOf);
      rows.push({
        name: nameCell,
        type: "`object`",
        description: resolved.description || merged.description || "",
      });
      if (merged.properties) {
        rows.push(
          ...flattenProperties(
            spec,
            merged.properties,
            merged.required,
            displayName,
            depth + 1,
          ),
        );
      }
    } else if (resolved.type === "array" && resolved.items) {
      const items = isReference(resolved.items)
        ? resolve<Schema>(spec, resolved.items)
        : resolved.items;

      if (items.type === "object" || items.properties || items.allOf) {
        rows.push({
          name: nameCell,
          type: "`[object]`",
          description: buildDescription(resolved, requiredSet.has(name)),
        });
        const effective = items.allOf ? mergeAllOf(spec, items.allOf) : items;
        if (effective.properties) {
          rows.push(
            ...flattenProperties(
              spec,
              effective.properties,
              effective.required,
              `${displayName}[]`,
              depth + 1,
            ),
          );
        }
      } else {
        const itemType = items.type || "unknown";
        rows.push({
          name: nameCell,
          type: `\`[${itemType}]\``,
          description: buildDescription(resolved, requiredSet.has(name)),
        });
      }
    } else {
      rows.push({
        name: nameCell,
        type: `\`${formatTypeString(resolved)}\``,
        description: buildDescription(resolved, requiredSet.has(name)),
      });
    }
  }

  return rows;
}

/**
 * Build a description string including property attributes.
 */
function buildDescription(schema: Schema, isRequired: boolean): string {
  const parts: string[] = [];

  if (schema.description) {
    parts.push(schema.description.trim());
  }

  const attrs: string[] = [];
  if (isRequired) attrs.push("Required");
  if (schema.readOnly) attrs.push("Read-only");
  if (schema.writeOnly) attrs.push("Write-only");
  if (schema.default !== undefined)
    attrs.push(`Default: \`${formatValue(schema.default)}\``);
  if (schema.minimum !== undefined) attrs.push(`Minimum: \`${schema.minimum}\``);
  if (schema.maximum !== undefined) attrs.push(`Maximum: \`${schema.maximum}\``);
  if (schema.enum) attrs.push(`Enum: ${schema.enum.map((v) => `\`${v}\``).join(", ")}`);
  if (schema.example !== undefined)
    attrs.push(`Example: \`${formatValue(schema.example)}\``);

  if (attrs.length > 0) {
    if (parts.length > 0) parts.push("");
    parts.push(attrs.join(". ") + ".");
  }

  return parts.join("\n");
}

function formatTypeString(schema: Schema): string {
  let type = schema.type || "unknown";

  if (schema.format) {
    type = `${type} (${schema.format})`;
  }
  if (schema.nullable) {
    type = `${type}|null`;
  }

  return type;
}

function formatPrimitiveType(schema: Schema): string {
  const parts = [schema.type || "unknown"];
  if (schema.format) parts.push(`(${schema.format})`);
  return parts.join(" ");
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
