/**
 * Field tables: the Name / Type / Description tables for parameters and schema
 * properties.
 *
 * Every Description cell is a single paragraph of inline content. Quarto
 * builds `.llms.md` from the rendered HTML with `pandoc -t gfm-raw_html`, and a
 * GFM pipe table can only hold inline content. One cell with block content (a
 * second paragraph, a list, a line break) makes Pandoc write `[TABLE]` in place
 * of the whole table.
 *
 * So a description's paragraphs, and the field's attributes, become spans that
 * the stylesheet displays as blocks: the HTML reads as before, and the GFM
 * conversion sees one paragraph. Content that cannot be a span, such as a list
 * or a code block, moves to a note under the table, which the cell points to.
 */

import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import { listTable, type TableRow } from "./markdown.ts";

/** CommonMark, matching the parser that escapes descriptions. */
const md = new MarkdownIt("commonmark");

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

/** A description split into what fits in a table cell and what does not. */
interface SplitDescription {
  /** Leading paragraphs, each as one line of inline markdown. */
  paragraphs: string[];
  /** Markdown source from the first block that cannot be inline, or "". */
  rest: string;
}

/** Whether a top-level paragraph renders as inline content only. */
function isInlineParagraph(inline: Token | undefined): boolean {
  return !(inline?.children ?? []).some((t) => t.type === "hardbreak");
}

function splitDescription(description: string): SplitDescription {
  const text = description.trim();
  const tokens = md.parse(text, {});
  const lines = text.split("\n");
  const paragraphs: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.level !== 0 || token.nesting === -1) continue;
    if (token.type === "paragraph_open" && isInlineParagraph(tokens[i + 1])) {
      paragraphs.push(
        tokens[i + 1].content
          .split("\n")
          .map((line) => line.trim())
          .join(" "),
      );
      continue;
    }
    const start = token.map?.[0] ?? lines.length;
    return { paragraphs, rest: lines.slice(start).join("\n").trim() };
  }
  return { paragraphs, rest: "" };
}

function descriptionCell(
  split: SplitDescription,
  attributes: string,
): string {
  const blocks = [...split.paragraphs];
  if (split.rest) blocks.push("Continued below the table.");
  const parts =
    blocks.length === 1 && !attributes
      ? blocks
      : blocks.map((p) => `[${p}]{.schema-para}`);
  if (attributes) parts.push(`[${attributes}]{.schema-attrs}`);
  return parts.join(" ");
}

function nameCell(row: FieldRow): string {
  return row.depth > 0
    ? `[\`${row.name}\`]{.schema-nest-${row.depth}}`
    : `\`${row.name}\``;
}

/**
 * Render rows as a field table, followed by a note for each row whose
 * description holds block content.
 */
export function fieldTable(rows: FieldRow[]): string[] {
  if (rows.length === 0) return [];

  const notes: string[] = [];
  const tableRows: TableRow[] = rows.map((row) => {
    const split = splitDescription(row.description);
    if (split.rest) {
      notes.push(`- \`${row.name}\`:`, "");
      for (const line of split.rest.split("\n")) {
        notes.push(line === "" ? "" : `  ${line}`);
      }
      notes.push("");
    }
    return {
      cells: [
        nameCell(row),
        `\`${row.type}\``,
        descriptionCell(split, row.attributes),
      ],
    };
  });

  const lines = listTable(["Name", "Type", "Description"], tableRows);
  if (notes.length > 0) {
    lines.push("", "::: {.schema-notes}", "", ...notes, ":::");
  }
  return lines;
}
