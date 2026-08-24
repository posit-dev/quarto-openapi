import { test } from "node:test";
import {
  assertEquals,
  assertStringIncludes,
} from "./assert.ts";
import {
  listTable,
  heading,
  pathToAnchor,
  sanitizeId,
  TABLE_DIV_CLOSE,
  TABLE_DIV_OPEN,
  type TableRow,
} from "../_extensions/quarto-openapi/lib/markdown.ts";

test("listTable: produces a Quarto list table with a header row", () => {
  const result = listTable(
    ["Name", "Type"],
    [{ cells: ["id", "string"] }, { cells: ["age", "integer"] }],
  );
  const output = result.join("\n");

  assertStringIncludes(output, TABLE_DIV_OPEN);
  assertStringIncludes(output, '::: {.list-table header-rows="1"');
  // First cell of a row opens the item, the rest are nested under it
  assertStringIncludes(output, "* * Name");
  assertStringIncludes(output, "  * Type");
  assertStringIncludes(output, "* * id");
  assertStringIncludes(output, "  * string");
  assertStringIncludes(output, "* * age");
  assertStringIncludes(output, "  * integer");
  assertEquals(result.at(-1), TABLE_DIV_CLOSE);
});

test("listTable: multi-line cell content indents to the item content level", () => {
  const result = listTable(
    ["Name", "Description"],
    [{ cells: ["id", "The unique\nidentifier"] }],
  );
  const output = result.join("\n");

  assertStringIncludes(output, "  * The unique");
  // Continuation lines sit under the item marker, not at column 0
  assertStringIncludes(output, "\n    identifier");
});

test("listTable: returns empty array for no rows", () => {
  const result = listTable(["Name", "Type"], []);
  assertEquals(result.length, 0);
});

test("heading: renders with optional anchor id", () => {
  assertEquals(heading(2, "Content"), "## Content");
  assertEquals(
    heading(3, "List pets", "listPets"),
    '### List pets {id="listPets"}',
  );
});

test("sanitizeId: strips quotes and special characters from anchor IDs", () => {
  assertEquals(sanitizeId('foo"bar'), "foo-bar");
  assertEquals(sanitizeId("get-/v1/pets"), "get-/v1/pets");
  assertEquals(sanitizeId("listPets-200"), "listPets-200");
  assertEquals(sanitizeId("a<b>c&d"), "a-b-c-d");
});

test("heading: sanitizes id to prevent attribute injection", () => {
  assertEquals(
    heading(3, "Danger", 'evil"} .class{id="x'),
    '### Danger {id="evil---.class-id--x"}',
  );
});

test("pathToAnchor: replaces braces with dashes", () => {
  assertEquals(
    pathToAnchor("get", "/v1/content/{guid}"),
    "get-/v1/content/-guid-",
  );
});

test("listTable: a cell holding two blocks emits a loose list", () => {
  const rows: TableRow[] = [
    { cells: ["`id`", "`string`", "First paragraph.\n\nSecond paragraph."] },
  ];

  const output = listTable(["Name", "Type", "Description"], rows).join("\n");

  // A loose row separates its items with blank lines so Pandoc reads each
  // cell as block content rather than running the paragraphs together.
  assertStringIncludes(output, "* * `id`\n\n  * `string`\n\n  * First paragraph.\n\n    Second paragraph.");
});

test("listTable: cell text is emitted verbatim, whatever its length", () => {
  const rows: TableRow[] = [
    { cells: ["`temp_ticket`", "`string`", "See [ref](#get-/v1/some/path) for details."] },
  ];

  const output = listTable(["Name", "Type", "Description"], rows).join("\n");

  assertStringIncludes(output, "  * See [ref](#get-/v1/some/path) for details.");
});
