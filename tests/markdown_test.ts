import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  gridTable,
  heading,
  pathToAnchor,
  sanitizeId,
} from "../_extensions/quarto-openapi/lib/markdown.ts";

Deno.test("gridTable: produces valid Pandoc grid table syntax", () => {
  const result = gridTable(
    ["Name", "Type"],
    [{ cells: ["id", "string"] }, { cells: ["age", "integer"] }],
  );
  const output = result.join("\n");

  // Header separator uses =
  assertStringIncludes(output, "+==");
  // Row separators use -
  assertStringIncludes(output, "+--");
  // Content present
  assertStringIncludes(output, "id");
  assertStringIncludes(output, "string");
  assertStringIncludes(output, "age");
  assertStringIncludes(output, "integer");
});

Deno.test("gridTable: multi-line cell content spans multiple rows", () => {
  const result = gridTable(
    ["Name", "Description"],
    [{ cells: ["id", "The unique\nidentifier"] }],
  );
  const output = result.join("\n");

  assertStringIncludes(output, "The unique");
  assertStringIncludes(output, "identifier");
});

Deno.test("gridTable: returns empty array for no rows", () => {
  const result = gridTable(["Name", "Type"], []);
  assertEquals(result.length, 0);
});

Deno.test("heading: renders with optional anchor id", () => {
  assertEquals(heading(2, "Content"), "## Content");
  assertEquals(
    heading(3, "List pets", "listPets"),
    '### List pets {id="listPets"}',
  );
});

Deno.test("sanitizeId: strips quotes and special characters from anchor IDs", () => {
  assertEquals(sanitizeId('foo"bar'), "foo-bar");
  assertEquals(sanitizeId("get-/v1/pets"), "get-/v1/pets");
  assertEquals(sanitizeId("listPets-200"), "listPets-200");
  assertEquals(sanitizeId("a<b>c&d"), "a-b-c-d");
});

Deno.test("heading: sanitizes id to prevent attribute injection", () => {
  assertEquals(
    heading(3, "Danger", 'evil"} .class{id="x'),
    '### Danger {id="evil---.class-id--x"}',
  );
});

Deno.test("pathToAnchor: replaces braces with dashes", () => {
  assertEquals(
    pathToAnchor("get", "/v1/content/{guid}"),
    "get-/v1/content/-guid-",
  );
});
