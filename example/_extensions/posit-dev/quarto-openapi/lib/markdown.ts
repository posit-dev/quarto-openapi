/**
 * Markdown generation utilities for Quarto-compatible output.
 * Produces Quarto list tables, fenced code blocks, tabsets, and anchored headings.
 */

export interface TableRow {
  cells: string[];
}

/** Fenced div markers wrapping every listTable() block. */
export const TABLE_DIV_OPEN = "::: {.quarto-openapi-table}";
export const TABLE_DIV_CLOSE = ":::";

/**
 * Format a column-width fraction the way Lua's tostring does (%.14g), which
 * is what Quarto's own grid-to-list table conversion emits.
 */
function formatWidth(x: number): string {
  let s = x.toPrecision(14);
  if (!s.includes("e") && s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s;
}

/**
 * Generate a Quarto list table.
 *
 * Cells are emitted verbatim as markdown: a cell's first line follows the item
 * marker and later lines are indented to the item's content level, so
 * multi-line and multi-paragraph cells work. A row whose cells are all single
 * blocks emits as a tight list; a row with any multi-block cell (one holding a
 * blank line) emits loose, matching Pandoc list semantics.
 *
 * Unlike the grid tables this replaces, cell text does not have to be in its
 * final form before layout — there is no alignment to preserve.
 *
 * Column width fractions are derived from the character widths a grid table
 * would have used, so rendered column proportions do not change.
 */
export function listTable(headers: string[], rows: TableRow[]): string[] {
  if (rows.length === 0) return [];

  const numCols = headers.length;

  const headerLines = headers.map((h) => h.split("\n"));
  const rowLines = rows.map((row) => row.cells.map((cell) => cell.split("\n")));

  // Column content widths (max line length, minimum 4).
  const colWidths = new Array(numCols).fill(0);
  for (let col = 0; col < numCols; col++) {
    for (const line of headerLines[col]) {
      colWidths[col] = Math.max(colWidths[col], line.length);
    }
    for (const row of rowLines) {
      for (const line of row[col]) {
        colWidths[col] = Math.max(colWidths[col], line.length);
      }
    }
    colWidths[col] = Math.max(colWidths[col], 4);
  }

  // Width fractions as Pandoc's grid-table reader would have derived them:
  // each column takes its content width plus two padding chars and one
  // separator, over the full line width (or 72, whichever is larger).
  const colUnits = colWidths.map((w) => w + 3);
  const total = colUnits.reduce((a, b) => a + b, 0);
  const denom = Math.max(72, total + 1);
  const widths = colUnits.map((u) => formatWidth(u / denom)).join(",");

  const lines: string[] = [];
  lines.push(TABLE_DIV_OPEN);
  lines.push(`::: {.list-table header-rows="1" widths="${widths}"}`);
  lines.push("");

  const emitGroup = (cellLines: string[][]) => {
    // Loose when any cell holds more than one block.
    const loose = cellLines.some((cl) => cl.some((line) => line === ""));
    cellLines.forEach((cl, col) => {
      if (loose && col > 0) lines.push("");
      lines.push((col === 0 ? "* * " : "  * ") + cl[0]);
      for (const line of cl.slice(1)) {
        lines.push(line === "" ? "" : "    " + line);
      }
    });
    lines.push("");
  };

  emitGroup(headerLines);
  for (const row of rowLines) emitGroup(row);

  lines.push(":::");
  lines.push("");
  lines.push(TABLE_DIV_CLOSE);

  return lines;
}

/**
 * Generate a fenced code block.
 */
export function codeBlock(lang: string, code: string): string[] {
  return [`\`\`\`{.${lang}}`, code.trimEnd(), "```"];
}

/**
 * Generate a Quarto tabset.
 */
export function tabset(
  tabs: { label: string; content: string[] }[],
  group?: string,
): string[] {
  const lines: string[] = [];
  const attr = group ? ` group="${group}"` : "";
  lines.push(`::: {.panel-tabset${attr}}`);
  lines.push("");
  for (const tab of tabs) {
    lines.push(`## ${tab.label}`);
    lines.push("");
    lines.push(...tab.content);
    lines.push("");
  }
  lines.push(":::");
  return lines;
}

/**
 * Sanitize a string for use as an HTML/Pandoc anchor ID.
 * Keeps alphanumerics, hyphens, underscores, dots, and slashes;
 * replaces everything else (including quotes) with hyphens.
 */
export function sanitizeId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._\/-]/g, "-");
}

/**
 * Generate a heading with an explicit anchor ID.
 */
export function heading(level: number, text: string, id?: string): string {
  const prefix = "#".repeat(level);
  if (id) {
    return `${prefix} ${text} {id="${sanitizeId(id)}"}`;
  }
  return `${prefix} ${text}`;
}

/**
 * Format an HTTP method as an uppercase badge-like string.
 */
export function methodBadge(method: string): string {
  return method.toUpperCase();
}

/**
 * Convert a path like /v1/content/{guid} to a slug for anchor IDs.
 * Replaces braces with dashes (rapidoc-style).
 */
export function pathToAnchor(method: string, path: string): string {
  return `${method}-${path.replace(/\{/g, "-").replace(/\}/g, "-")}`;
}

/**
 * Emit lines joined with blank line separators.
 */
export function joinSections(...sections: string[][]): string[] {
  const result: string[] = [];
  for (const section of sections) {
    if (section.length > 0) {
      if (result.length > 0) result.push("");
      result.push(...section);
    }
  }
  return result;
}
