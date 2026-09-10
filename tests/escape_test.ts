import { test } from "node:test";
import { assertEquals } from "./assert.ts";
import {
  escapePathBracesOutsideCode,
  escapeSpecDescriptions,
  escapeUnmatchedBrackets,
  fenceHtmlBlocks,
  markInlineHtmlExplicit,
} from "../_extensions/quarto-openapi/lib/escape.ts";

test("escapeUnmatchedBrackets: escapes an unclosed bracket in prose", () => {
  assertEquals(
    escapeUnmatchedBrackets("Window is [start, start+interval)"),
    "Window is \\[start, start+interval)",
  );
});

test("escapeUnmatchedBrackets: leaves link syntax alone", () => {
  const text = "See [the pets endpoint](#listPets) for details.";
  assertEquals(escapeUnmatchedBrackets(text), text);
});

test("escapeUnmatchedBrackets: escapes an unopened closing bracket", () => {
  assertEquals(escapeUnmatchedBrackets("a] b"), "a\\] b");
});

test("escapeUnmatchedBrackets: leaves brackets inside a code span alone", () => {
  const text = "Pass `filter[0]=x` as the query.";
  assertEquals(escapeUnmatchedBrackets(text), text);
});

test("escapeUnmatchedBrackets: leaves brackets inside a fenced block alone", () => {
  const text = "Before.\n\n```json\n{\"a\": [1, 2}\n```\n\nAfter.";
  assertEquals(escapeUnmatchedBrackets(text), text);
});

test("escapeUnmatchedBrackets: leaves an already-escaped bracket alone", () => {
  assertEquals(escapeUnmatchedBrackets("a \\[ b"), "a \\[ b");
});

test("markInlineHtmlExplicit: marks a raw HTML tag as a raw inline", () => {
  assertEquals(
    markInlineHtmlExplicit('Download the <a href="/x.tar.gz">bundle</a>.'),
    'Download the `<a href="/x.tar.gz">`{=html}bundle`</a>`{=html}.',
  );
});

test("markInlineHtmlExplicit: leaves CommonMark autolinks alone", () => {
  const text = "Mail <user@example.com> or visit <https://example.com>.";
  assertEquals(markInlineHtmlExplicit(text), text);
});

test("markInlineHtmlExplicit: leaves comparisons alone", () => {
  const text = "Valid when a < b and x <= 5.";
  assertEquals(markInlineHtmlExplicit(text), text);
});

test("markInlineHtmlExplicit: leaves tags inside code alone", () => {
  const text = "Render `<br>` literally.\n\n```html\n<div>x</div>\n```";
  assertEquals(markInlineHtmlExplicit(text), text);
});

test("escapePathBracesOutsideCode: escapes a path parameter in prose", () => {
  assertEquals(
    escapePathBracesOutsideCode("Call GET /v1/users/{guid}/keys to list them."),
    "Call GET /v1/users/\\{guid\\}/keys to list them.",
  );
});

test("escapePathBracesOutsideCode: leaves a path parameter inside code alone", () => {
  const text = "Call `GET /v1/users/{guid}/keys` to list them.";
  assertEquals(escapePathBracesOutsideCode(text), text);
});

test("escapeSpecDescriptions: reaches descriptions nested anywhere in the spec", () => {
  const spec = {
    info: { description: "Top [level" },
    paths: {
      "/pets": {
        get: {
          responses: {
            "200": { description: 'See <a href="/x">x</a> and [a, b)' },
          },
        },
      },
    },
    components: { schemas: { Pet: { properties: [{ description: "a]" }] } } },
  };

  escapeSpecDescriptions(spec);

  assertEquals(spec.info.description, "Top \\[level");
  assertEquals(
    spec.paths["/pets"].get.responses["200"].description,
    'See `<a href="/x">`{=html}x`</a>`{=html} and \\[a, b)',
  );
  assertEquals(spec.components.schemas.Pet.properties[0].description, "a\\]");
});

test("escapeSpecDescriptions: leaves a bracket inside an HTML attribute alone", () => {
  const spec = { info: { description: '<a href="/x?a[0]=1">link</a>' } };

  escapeSpecDescriptions(spec);

  assertEquals(
    spec.info.description,
    '`<a href="/x?a[0]=1">`{=html}link`</a>`{=html}',
  );
});

test("escapeUnmatchedBrackets: leaves brackets inside a tilde fence alone", () => {
  const text = 'Before.\n\n~~~json\n{"a": [1, 2}\n~~~\n\nAfter.';
  assertEquals(escapeUnmatchedBrackets(text), text);
});

test("escapeUnmatchedBrackets: leaves brackets inside a long backtick fence alone", () => {
  const text = 'Before.\n\n````md\n```\n[unclosed\n```\n````\n\nAfter.';
  assertEquals(escapeUnmatchedBrackets(text), text);
});

test("escapeUnmatchedBrackets: leaves brackets inside an indented fence alone", () => {
  // Cell content in a list table is indented to the item's content level.
  const text = "  * Example:\n\n    ```json\n    [1, 2}\n    ```\n";
  assertEquals(escapeUnmatchedBrackets(text), text);
});

test("markInlineHtmlExplicit: leaves tags inside a tilde fence alone", () => {
  const text = "Render this:\n\n~~~html\n<div>x</div>\n~~~";
  assertEquals(markInlineHtmlExplicit(text), text);
});

test("escapePathBracesOutsideCode: escapes parameter names with digits and hyphens", () => {
  assertEquals(
    escapePathBracesOutsideCode("See /v1/users/{user-id}/keys/{key2}."),
    "See /v1/users/\\{user-id\\}/keys/\\{key2\\}.",
  );
});

test("escapePathBracesOutsideCode: leaves a path parameter inside an indented fence alone", () => {
  const text = "    ```bash\n    curl /v1/users/{user-id}\n    ```\n";
  assertEquals(escapePathBracesOutsideCode(text), text);
});

test("escapePathBracesOutsideCode: leaves a path parameter inside a tilde fence alone", () => {
  const text = "~~~bash\ncurl /v1/users/{guid}\n~~~\n";
  assertEquals(escapePathBracesOutsideCode(text), text);
});

test("escapePathBracesOutsideCode: an unclosed indented fence does not swallow prose", () => {
  // At four spaces a lone fence is the literal content of an indented code
  // block, so the prose after it still needs escaping.
  assertEquals(
    escapePathBracesOutsideCode("    ```\n\nThen call GET /v1/users/{id}."),
    "    ```\n\nThen call GET /v1/users/\\{id\\}.",
  );
});

test("escapeUnmatchedBrackets: an unclosed fence runs to the end of the text", () => {
  const text = "Before.\n\n```json\n[1, 2}\n";
  assertEquals(escapeUnmatchedBrackets(text), text);
});

test("escapePathBracesOutsideCode: a column-zero fence does not close an indented one", () => {
  // The indented line is literal content of an indented code block; the fence
  // at column zero starts a block of its own.
  assertEquals(
    escapePathBracesOutsideCode("    ```\n\nCall /v1/users/{id}.\n```"),
    "    ```\n\nCall /v1/users/\\{id\\}.\n```",
  );
});

test("escapePathBracesOutsideCode: a tab counts as four columns of indent", () => {
  assertEquals(
    escapePathBracesOutsideCode("\t```\n\nCall /v1/users/{id}."),
    "\t```\n\nCall /v1/users/\\{id\\}.",
  );
});

test("escapeUnmatchedBrackets: a closing fence may shift up to three spaces", () => {
  const text = "  ```json\n[1, 2}\n   ```\n";
  assertEquals(escapeUnmatchedBrackets(text), text);
});

test("fenceHtmlBlocks: fences a block-level element as a raw HTML block", () => {
  const text = "<table>\n<tr><td>1</td></tr>\n</table>";
  assertEquals(
    fenceHtmlBlocks(text),
    "```{=html}\n<table>\n<tr><td>1</td></tr>\n</table>\n```",
  );
});

test("fenceHtmlBlocks: leaves an inline tag inside a paragraph alone", () => {
  const text = 'Download the <a href="/x.tar.gz">bundle</a>.';
  assertEquals(fenceHtmlBlocks(text), text);
});

test("fenceHtmlBlocks: leaves an autolink that opens a line alone", () => {
  const text = "<https://example.com> is the home page.";
  assertEquals(fenceHtmlBlocks(text), text);
});

test("fenceHtmlBlocks: ends the block at a blank line", () => {
  assertEquals(
    fenceHtmlBlocks("<hr>\n\nAfter the rule."),
    "```{=html}\n<hr>\n```\n\nAfter the rule.",
  );
});

test("fenceHtmlBlocks: outruns a backtick run inside the block", () => {
  assertEquals(
    fenceHtmlBlocks("<p>Use ```code``` here</p>"),
    "````{=html}\n<p>Use ```code``` here</p>\n````",
  );
});

test("escapeSpecDescriptions: fences a block-level HTML table", () => {
  const spec = {
    info: { description: "Codes:\n\n<table>\n<tr><td>1</td></tr>\n</table>" },
  };

  escapeSpecDescriptions(spec);

  assertEquals(
    spec.info.description,
    "Codes:\n\n```{=html}\n<table>\n<tr><td>1</td></tr>\n</table>\n```",
  );
});

test("fenceHtmlBlocks: fences a block that follows prose", () => {
  assertEquals(
    fenceHtmlBlocks("Intro.\n\n<div class=\"x\">\ncontent\n</div>\n\nOutro."),
    "Intro.\n\n```{=html}\n<div class=\"x\">\ncontent\n</div>\n```\n\nOutro.",
  );
});

test("fenceHtmlBlocks: leaves a tag inside a fenced code block alone", () => {
  const text = "```html\n<table>\n<tr><td>1</td></tr>\n</table>\n```";
  assertEquals(fenceHtmlBlocks(text), text);
});
