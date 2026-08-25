/**
 * Rewrites that make OpenAPI description text safe to emit as Quarto markdown.
 *
 * Descriptions are CommonMark written for arbitrary renderers, so they contain
 * constructs Quarto reads as markup: an unclosed `[` opens a span, `{...}`
 * opens an attribute block, and a bare HTML tag becomes a raw inline. Quarto 2
 * hard-errors on the first two and warns on the third.
 *
 * Every rewrite here skips code spans and fenced code blocks, where braces and
 * angle brackets already render verbatim and a backslash or backtick would
 * become literal output rather than markup.
 */

/** A run of text that is either markdown prose or literal code. */
interface Segment {
  code: boolean;
  text: string;
}

/**
 * An opening code fence: three or more backticks or tildes at the start of a
 * line. CommonMark allows up to three spaces of indentation; more indentation
 * is accepted here because a fence inside a list-table cell is indented to the
 * item's content level, and a fence in an indented code block is literal code
 * either way.
 */
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;

/** A fence of the same character, at least as long, and nothing else. */
const FENCE_CLOSE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

/** The index of the newline ending the line at `from`, or the end of `text`. */
function lineEnd(text: string, from: number): number {
  const nl = text.indexOf("\n", from);
  return nl === -1 ? text.length : nl;
}

function closesFence(line: string, marker: string): boolean {
  const found = line.match(FENCE_CLOSE)?.[1];
  return found !== undefined &&
    found[0] === marker[0] &&
    found.length >= marker.length;
}

/**
 * Return the end of the fenced block opened by `marker` on the line at
 * `start`, including the closing fence. An unclosed block runs to the end.
 */
function fenceEnd(text: string, start: number, marker: string): number {
  let i = lineEnd(text, start);
  while (i < text.length) {
    i++; // step over the newline ending the previous line
    const end = lineEnd(text, i);
    if (closesFence(text.slice(i, end), marker)) return end;
    i = end;
  }
  return text.length;
}

/**
 * Split `text` into prose and code segments. Code segments are fenced blocks
 * and inline code spans; concatenating every segment reproduces `text`.
 */
function splitCode(text: string): Segment[] {
  const segments: Segment[] = [];
  let start = 0;
  let atLineStart = true;
  let i = 0;

  const emit = (end: number, code: boolean) => {
    if (end > start) segments.push({ code, text: text.slice(start, end) });
    start = end;
  };

  while (i < text.length) {
    if (atLineStart) {
      const marker = text.slice(i, lineEnd(text, i)).match(FENCE_OPEN)?.[1];
      if (marker !== undefined) {
        emit(i, false);
        i = fenceEnd(text, i, marker);
        emit(i, true);
        continue;
      }
    }
    const c = text[i];
    if (c === "`") {
      // An inline code span closes on a backtick run of the same length.
      let run = 0;
      while (text[i + run] === "`") run++;
      const close = text.indexOf("`".repeat(run), i + run);
      emit(i, false);
      i = close === -1 ? i + run : close + run;
      emit(i, true);
      atLineStart = false;
      continue;
    }
    if (c === "\\") {
      // An escaped backtick cannot open a code span.
      i += 2;
      atLineStart = false;
      continue;
    }
    atLineStart = c === "\n";
    i++;
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
 * inline code spans and fenced code blocks through untouched.
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
 * HTML is marked first: it wraps each tag in backticks, so the bracket pass
 * then sees those as code spans and leaves any `[` inside an attribute (e.g.
 * `href="…?a[0]=1"`) alone.
 */
export function escapeSpecDescriptions(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) escapeSpecDescriptions(item);
  } else if (node !== null && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (key === "description" && typeof value === "string") {
        obj[key] = escapeUnmatchedBrackets(markInlineHtmlExplicit(value));
      } else {
        escapeSpecDescriptions(value);
      }
    }
  }
}
