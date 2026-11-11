/**
 * Field tables: the Name / Type / Description tables for parameters and schema
 * properties.
 *
 * Quarto builds a page's `.llms.md` by converting its rendered HTML with
 * Pandoc's GFM writer. A GFM table cell holds inline content only, so a
 * description with a second paragraph, a list or a line break would turn the
 * whole table into `[TABLE]`. Each field table therefore comes in two forms:
 * the list table for every format but `llms-txt`, and for `llms-txt` a bullet
 * list with one item per field, where any markdown fits. Quarto keeps the
 * `llms-txt` form out of the HTML page and its search index.
 */

import { listTable } from "./markdown.ts";

export interface FieldRow {
  /** The field's name, dotted for nested properties (`owner.guid`). */
  name: string;
  /** Nesting level; 0 for top-level fields. */
  depth: number;
  /** The type label, without code formatting. */
  type: string;
  /** The field's description as markdown, possibly empty. */
  description: string;
  /** Attribute sentences such as "Required. Example: `x`.", possibly empty. */
  attributes: string;
}

/** The description followed by the attributes, as separate paragraphs. */
function details(row: FieldRow): string {
  return [row.description.trim(), row.attributes]
    .filter((part) => part !== "")
    .join("\n\n");
}

function nameCell(row: FieldRow): string {
  return row.depth > 0
    ? `[\`${row.name}\`]{.schema-nest-${row.depth}}`
    : `\`${row.name}\``;
}

/**
 * The `llms-txt` form: one loose list item per field, headed by its name and
 * type, with the details as the item's blocks.
 */
function fieldList(rows: FieldRow[]): string[] {
  const lines: string[] = [];
  for (const row of rows) {
    lines.push(`- \`${row.name}\` (\`${row.type}\`)`, "");
    const text = details(row);
    if (text === "") continue;
    for (const line of text.split("\n")) {
      lines.push(line === "" ? "" : `  ${line}`);
    }
    lines.push("");
  }
  return lines;
}

/** Render rows as a field table, plus its `llms-txt` form. */
export function fieldTable(rows: FieldRow[]): string[] {
  if (rows.length === 0) return [];

  const table = listTable(
    ["Name", "Type", "Description"],
    rows.map((row) => ({
      cells: [nameCell(row), `\`${row.type}\``, details(row)],
    })),
  );
  return [
    '::: {.content-hidden when-format="llms-txt"}',
    "",
    ...table,
    "",
    ":::",
    "",
    '::: {.content-visible when-format="llms-txt"}',
    "",
    ...fieldList(rows),
    ":::",
  ];
}
