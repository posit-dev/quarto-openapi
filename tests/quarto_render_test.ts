/**
 * Integration test for list tables: renders what `listTable()` emits through
 * Quarto and checks the HTML it produces.
 *
 * The markdown unit tests assert on generated text, which cannot tell a valid
 * list table from an invalid one — Quarto reads a malformed one as a bullet
 * list rather than failing. Only a real render shows whether the header row,
 * the column widths, and multi-paragraph cells survive.
 *
 * Skipped when Quarto is missing or older than the 1.9 the extension requires.
 */

import { test } from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { assert, assertEquals, assertStringIncludes } from "./assert.ts";
import { listTable } from "../_extensions/quarto-openapi/lib/markdown.ts";
import { escapePathBracesOutsideCode } from "../_extensions/quarto-openapi/lib/escape.ts";

const execFileAsync = promisify(execFile);

/** Why to skip, or false when Quarto can render list tables here. */
const skip = await (async (): Promise<string | false> => {
  try {
    const { stdout } = await execFileAsync("quarto", ["--version"]);
    const version = stdout.trim();
    const [major = 0, minor = 0] = version.split(".").map(Number);
    if (major < 1 || (major === 1 && minor < 9)) {
      return `quarto ${version} predates list tables`;
    }
    return false;
  } catch {
    return "quarto is not on PATH";
  }
})();

/** Render `markdown` as a standalone page and return the resulting HTML. */
async function render(markdown: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "quarto-openapi-render-"));
  try {
    await writeFile(join(dir, "page.qmd"), markdown);
    await execFileAsync("quarto", [
      "render",
      "page.qmd",
      "--to",
      "html",
      "--output",
      "page.html",
    ], { cwd: dir });
    return await readFile(join(dir, "page.html"), "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The first `<table>` element in `html`, which is the one under test. */
function tableOf(html: string): string {
  const table = html.match(/<table[\s\S]*?<\/table>/)?.[0];
  assert(table, "expected the page to contain a table");
  return table;
}

test("Quarto renders a generated list table as a table", { skip }, async () => {
  const markdown = [
    "---",
    "title: List table",
    "---",
    "",
    ...listTable(
      ["Name", "Type", "Description"],
      [
        {
          cells: [
            "`widget_id`",
            "`string`",
            "First paragraph.\n\nSecond paragraph.",
          ],
        },
        { cells: ["`limit`", "`integer`", "Page size."] },
      ],
    ),
    "",
  ].join("\n");

  const table = tableOf(await render(markdown));

  // A malformed list table degrades to a bullet list instead of erroring.
  assertEquals(table.includes("<ul>"), false, `read as a list:\n${table}`);

  // Header row.
  assertStringIncludes(table, "<thead>");
  for (const header of ["Name", "Type", "Description"]) {
    assertStringIncludes(table, `<th>${header}</th>`);
  }

  // Body cells keep their inline markup.
  assertStringIncludes(table, "<code>widget_id</code>");
  assertStringIncludes(table, "<code>integer</code>");
  assertStringIncludes(table, "Page size.");

  // A cell holding two blocks stays two paragraphs.
  assertStringIncludes(
    table,
    "<p>First paragraph.</p>\n<p>Second paragraph.</p>",
  );

  // One column per header, and `widths` reaches the rendered proportions.
  const widths = [...table.matchAll(/<col style="width: (\d+)%">/g)]
    .map((match) => Number(match[1]));
  assertEquals(widths.length, 3);
  assert(
    widths[2] > widths[0] && widths[2] > widths[1],
    `expected the description column to be widest, got ${widths.join(",")}`,
  );
});

test("Quarto renders a fenced cell and escaped braces verbatim", { skip }, async () => {
  // Cell content is indented to the item's content level, so a fence inside a
  // cell is an indented fence. Quarto has to read it as code, and the escaped
  // braces in the prose cell beside it have to reach the reader as literal
  // braces rather than as backslashes or as an attribute block.
  const markdown = escapePathBracesOutsideCode([
    "---",
    "title: Path parameters",
    "---",
    "",
    ...listTable(
      ["Name", "Description"],
      [
        {
          cells: [
            "`widget-id`",
            "Example:\n\n```bash\ncurl /v1/widgets/{widget-id}\n```",
          ],
        },
        { cells: ["`key2`", "Passed to GET /v1/widgets/{widget-id}/keys/{key2}."] },
      ],
    ),
    "",
  ].join("\n"));

  const table = tableOf(await render(markdown));

  assertStringIncludes(table, '<pre class="sourceCode bash');
  assertStringIncludes(table, "/v1/widgets/{widget-id}");
  assertStringIncludes(table, "GET /v1/widgets/{widget-id}/keys/{key2}.");
  assertEquals(table.includes("\\{"), false, `braces left escaped:\n${table}`);
});
