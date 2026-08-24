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

/**
 * Escape square brackets that don't pair up into link or span syntax, e.g.
 * interval notation like `[timestamp, timestamp+interval)`. Paired brackets
 * are left alone, as is anything inside code.
 */
export function escapeUnmatchedBrackets(text: string): string {
  const chars = text.split("");
  const opens: number[] = [];
  const unmatched: number[] = [];
  let inFence = false;
  let atLineStart = true;
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (atLineStart && text.startsWith("```", i)) {
      inFence = !inFence;
      while (i < chars.length && chars[i] !== "\n") i++;
      continue;
    }
    atLineStart = c === "\n";
    if (inFence) {
      i++;
      continue;
    }
    if (c === "`") {
      // Skip an inline code span, matching the opening backtick run length.
      let run = 0;
      while (chars[i + run] === "`") run++;
      const close = text.indexOf("`".repeat(run), i + run);
      i = close === -1 ? i + run : close + run;
      continue;
    }
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "[") opens.push(i);
    else if (c === "]") {
      if (opens.length > 0) opens.pop();
      else unmatched.push(i);
    }
    i++;
  }
  unmatched.push(...opens);
  // Splice from the back so earlier positions stay valid.
  unmatched.sort((a, b) => b - a);
  for (const pos of unmatched) chars.splice(pos, 0, "\\");
  return chars.join("");
}

/**
 * Apply `fn` to the parts of `text` that are ordinary markdown prose, passing
 * inline code spans and fenced code blocks through untouched.
 */
function transformOutsideCode(
  text: string,
  fn: (prose: string) => string,
): string {
  const out: string[] = [];
  let segStart = 0;
  let inFence = false;
  let atLineStart = true;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (atLineStart && text.startsWith("```", i)) {
      if (!inFence) {
        out.push(fn(text.slice(segStart, i)));
        segStart = i;
      }
      inFence = !inFence;
      while (i < text.length && text[i] !== "\n") i++;
      if (!inFence) {
        out.push(text.slice(segStart, i));
        segStart = i;
      }
      continue;
    }
    atLineStart = c === "\n";
    if (inFence) {
      i++;
      continue;
    }
    if (c === "`") {
      let run = 0;
      while (text[i + run] === "`") run++;
      const close = text.indexOf("`".repeat(run), i + run);
      const end = close === -1 ? i + run : close + run;
      out.push(fn(text.slice(segStart, i)));
      out.push(text.slice(i, end));
      segStart = end;
      i = end;
      continue;
    }
    if (c === "\\") {
      i += 2;
      continue;
    }
    i++;
  }
  out.push(inFence ? text.slice(segStart) : fn(text.slice(segStart)));
  return out.join("");
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
 */
export function escapePathBracesOutsideCode(text: string): string {
  return transformOutsideCode(text, (s) =>
    s.replace(/\/\{([A-Za-z_]+)\}/g, "/\\{$1\\}"),
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
