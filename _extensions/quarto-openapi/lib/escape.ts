/**
 * Rewrites that make OpenAPI description text safe to emit as Quarto markdown.
 *
 * Descriptions are CommonMark written for arbitrary renderers, so they contain
 * constructs Quarto reads as markup: an unclosed `[` opens a span, `{...}`
 * opens an attribute block, and a bare HTML tag becomes a raw inline. Quarto 2
 * hard-errors on the first two and warns on the third.
 *
 * Every rewrite here skips code, where braces and angle brackets already render
 * verbatim and a backslash or backtick would become literal output rather than
 * markup. A CommonMark parser decides what is code: block structure is where
 * hand-rolled scanning goes wrong, because a fence can open inside a list item,
 * carry any indentation, and never close.
 */

import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";

/** CommonMark, so the reading matches the spec the descriptions are written to. */
const md = new MarkdownIt("commonmark");

/** A run of text that is either markdown prose or literal code. */
interface Segment {
  code: boolean;
  text: string;
}

/**
 * Token types whose source lines are literal content. `html_block` is not code,
 * but its angle brackets and braces are markup for a browser rather than for
 * Quarto, so the rewrites have to leave it alone too.
 */
const LITERAL_BLOCKS = new Set(["fence", "code_block", "html_block"]);

/**
 * Line ranges, as `[start, end)` line indices, that the parser reads as
 * literal blocks.
 */
function literalBlockRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  const walk = (tokens: Token[]): void => {
    for (const token of tokens) {
      if (LITERAL_BLOCKS.has(token.type) && token.map) ranges.push(token.map);
      if (token.children) walk(token.children);
    }
  };
  walk(md.parse(text, {}));
  return ranges;
}

/** The character offset at which each line of `text` starts. */
function lineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

/**
 * Split `text` into prose and code segments. Concatenating every segment
 * reproduces `text`.
 *
 * Literal blocks come from the parser. Inline code spans are found by pairing
 * backtick runs in what is left, which is all CommonMark asks for once block
 * structure is settled.
 */
function splitCode(text: string): Segment[] {
  const offsets = lineOffsets(text);
  const blocks = literalBlockRanges(text)
    .map(([start, end]): [number, number] => [
      offsets[start] ?? text.length,
      offsets[end] ?? text.length,
    ])
    .sort((a, b) => a[0] - b[0]);

  const segments: Segment[] = [];
  const push = (code: boolean, chunk: string) => {
    if (chunk) segments.push({ code, text: chunk });
  };

  let cursor = 0;
  for (const [start, end] of blocks) {
    if (start < cursor) continue; // nested inside a block already taken
    push(false, "");
    segments.push(...splitInlineCode(text.slice(cursor, start)));
    push(true, text.slice(start, end));
    cursor = end;
  }
  segments.push(...splitInlineCode(text.slice(cursor)));
  return segments;
}

/** Split prose into segments, marking inline code spans as code. */
function splitInlineCode(text: string): Segment[] {
  const segments: Segment[] = [];
  let start = 0;
  let i = 0;

  const emit = (end: number, code: boolean) => {
    if (end > start) segments.push({ code, text: text.slice(start, end) });
    start = end;
  };

  while (i < text.length) {
    if (text[i] === "\\") {
      // An escaped backtick cannot open a code span.
      i += 2;
      continue;
    }
    if (text[i] !== "`") {
      i++;
      continue;
    }
    // A code span closes on a backtick run of the same length.
    let run = 0;
    while (text[i + run] === "`") run++;
    const close = text.indexOf("`".repeat(run), i + run);
    emit(i, false);
    i = close === -1 ? i + run : close + run;
    emit(i, true);
  }
  emit(text.length, false);
  return segments;
}

/**
 * Escape square brackets that don't pair up into link or span syntax, e.g.
 * interval notation like `[timestamp, timestamp+interval)`. Paired brackets
 * are left alone, as is anything inside code.
 */
export function escapeUnmatchedBrackets(text: string): string {
  const segments = splitCode(text);
  const parts = segments.map((segment) => segment.text.split(""));
  // Positions as [segment, offset]; brackets pair across intervening code.
  const opens: [number, number][] = [];
  const unmatched: [number, number][] = [];

  segments.forEach((segment, seg) => {
    if (segment.code) return;
    const chars = parts[seg];
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === "\\") i++;
      else if (chars[i] === "[") opens.push([seg, i]);
      else if (chars[i] === "]") {
        if (opens.length > 0) opens.pop();
        else unmatched.push([seg, i]);
      }
    }
  });
  unmatched.push(...opens);

  // Splice from the back so earlier positions stay valid.
  unmatched.sort(([segA, a], [segB, b]) => segB - segA || b - a);
  for (const [seg, pos] of unmatched) parts[seg].splice(pos, 0, "\\");
  return parts.map((part) => part.join("")).join("");
}

/**
 * Apply `fn` to the parts of `text` that are ordinary markdown prose, passing
 * code through untouched.
 */
function transformOutsideCode(
  text: string,
  fn: (prose: string) => string,
): string {
  return splitCode(text)
    .map((segment) => (segment.code ? segment.text : fn(segment.text)))
    .join("");
}

/**
 * Wrap CommonMark HTML blocks in an explicit `{=html}` raw block.
 *
 * Quarto passes a bare block through as a raw HTML block and warns once per
 * element. Fencing it says the same thing without the warning, and keeps the
 * block a block. Marking each tag as a raw *inline* instead would not: the
 * block becomes paragraph content, which leaves an empty paragraph on either
 * side and runs the text of neighboring cells together in a search index.
 *
 * One difference to accept: Quarto reads the text inside a bare block as
 * markdown, so `doesn't` picks up a curly apostrophe there and stays straight
 * inside a fence. Fencing is what the format means, and no explicit form
 * reproduces the implicit one exactly.
 *
 * Runs before `markInlineHtmlExplicit`, which skips code and so leaves the
 * fenced block alone.
 */
export function fenceHtmlBlocks(text: string): string {
  const blocks = md
    .parse(text, {})
    .filter((token) => token.type === "html_block" && token.map)
    .map((token) => token.map as [number, number]);
  if (blocks.length === 0) return text;

  const lines = text.split("\n");
  const out: string[] = [];
  let cursor = 0;

  for (const [start, end] of blocks) {
    out.push(...lines.slice(cursor, start));
    const block = lines.slice(start, end);
    // The fence has to outrun the longest backtick run in the block it holds.
    const longest = Math.max(
      0,
      ...block.flatMap((line) =>
        [...line.matchAll(/`+/g)].map((run) => run[0].length)
      ),
    );
    const fence = "`".repeat(Math.max(3, longest + 1));
    out.push(`${fence}{=html}`, ...block, fence);
    cursor = end;
  }
  out.push(...lines.slice(cursor));
  return out.join("\n");
}

/**
 * Mark raw HTML in a description as an explicit raw inline. Descriptions are
 * CommonMark, so a spec may legitimately use HTML; Quarto converts such a tag
 * to a raw inline anyway and warns once per element per page. Saying so
 * explicitly produces identical output without the warning.
 *
 * Deliberately conservative: a match needs a well-formed tag name and
 * attributes free of angle brackets, which leaves alone `a < b`, `x <= 5`, and
 * CommonMark autolinks like `<user@example.com>` and `<https://example.com>`,
 * which Quarto renders as links and which wrapping would break.
 */
export function markInlineHtmlExplicit(text: string): string {
  return transformOutsideCode(text, (s) =>
    s.replace(
      /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^<>]*?)?\/?>/g,
      (tag) => `\`${tag}\`{=html}`,
    ),
  );
}

/**
 * Escape URL path parameters (`/{guid}` -> `/\{guid\}`) in prose. Quarto
 * reserves `{...}` for attribute syntax and rejects bare braces, but renders
 * them verbatim inside code — where a backslash would be literal and corrupt
 * the output as `GET /v1/users/\{guid\}/keys`.
 *
 * OpenAPI puts no character restrictions on parameter names, so any brace pair
 * following a slash and holding a single path segment counts.
 */
export function escapePathBracesOutsideCode(text: string): string {
  return transformOutsideCode(text, (s) =>
    s.replace(/\/\{([^{}\/\s]+)\}/g, "/\\{$1\\}"),
  );
}

/**
 * Apply the prose-safety rewrites to every `description` field in the spec, in
 * place, so all sinks — prose, tables, tabsets — emit safe text.
 *
 * HTML blocks are fenced first, so the later passes see them as code and leave
 * them verbatim. Remaining tags are inline, and marking them wraps each one in
 * backticks, so the bracket pass then sees those as code spans and leaves any
 * `[` inside an attribute (e.g. `href="…?a[0]=1"`) alone.
 */
export function escapeSpecDescriptions(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) escapeSpecDescriptions(item);
  } else if (node !== null && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (key === "description" && typeof value === "string") {
        obj[key] = escapeUnmatchedBrackets(
          markInlineHtmlExplicit(fenceHtmlBlocks(value)),
        );
      } else {
        escapeSpecDescriptions(value);
      }
    }
  }
}
