/**
 * Markdown generation utilities for Quarto-compatible output.
 * Produces Pandoc grid tables, fenced code blocks, tabsets, and anchored headings.
 */

export interface TableRow {
  cells: string[];
}

/**
 * Generate a Pandoc grid table.
 *
 * Grid tables support multi-line cells and are the most flexible
 * table format in Pandoc/Quarto.
 */
export function gridTable(headers: string[], rows: TableRow[]): string[] {
  if (rows.length === 0) return [];

  const numCols = headers.length;

  // Split each cell into lines for multi-line support
  const headerLines = headers.map((h) => h.split("\n"));
  const rowLines = rows.map((row) =>
    row.cells.map((cell) => cell.split("\n"))
  );

  // Compute column widths (max width of any line in any cell)
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
    // Minimum width of 4 for readability
    colWidths[col] = Math.max(colWidths[col], 4);
  }

  const lines: string[] = [];

  const separator = (char: string) =>
    "+" + colWidths.map((w) => char.repeat(w + 2)).join("+") + "+";

  const emitRow = (cellLines: string[][]) => {
    const maxLines = Math.max(...cellLines.map((cl) => cl.length));
    for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
      const parts = cellLines.map((cl, col) => {
        const text = lineIdx < cl.length ? cl[lineIdx] : "";
        return " " + text.padEnd(colWidths[col]) + " ";
      });
      lines.push("|" + parts.join("|") + "|");
    }
  };

  lines.push(separator("-"));
  emitRow(headerLines);
  lines.push(separator("="));

  for (const row of rowLines) {
    emitRow(row);
    lines.push(separator("-"));
  }

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
 * Generate a heading with an explicit anchor ID.
 */
export function heading(level: number, text: string, id?: string): string {
  const prefix = "#".repeat(level);
  if (id) {
    return `${prefix} ${text} {id="${id}"}`;
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
