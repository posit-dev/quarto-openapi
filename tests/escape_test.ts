import { test } from "node:test";
import { assertEquals } from "./assert.ts";
import {
  escapePathBracesOutsideCode,
  escapeSpecDescriptions,
  escapeUnmatchedBrackets,
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
