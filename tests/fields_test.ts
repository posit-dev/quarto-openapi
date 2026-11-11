import { test } from "node:test";
import { assertEquals, assertStringIncludes } from "./assert.ts";
import {
  fieldTable,
  type FieldRow,
} from "../_extensions/quarto-openapi/lib/fields.ts";

function field(overrides: Partial<FieldRow>): FieldRow {
  return {
    name: "guid",
    depth: 0,
    type: "string",
    description: "",
    attributes: "",
    ...overrides,
  };
}

/** The Description cell of the only body row. */
function descriptionCell(lines: string[]): string {
  const start = lines.indexOf("* * `guid`");
  return lines[start + 2].replace(/^ {2}\* /, "");
}

test("fieldTable: a one-paragraph description is emitted as is", () => {
  const lines = fieldTable([field({ description: "The identifier." })]);
  assertEquals(descriptionCell(lines), "The identifier.");
});

test("fieldTable: attributes share the description's paragraph", () => {
  const lines = fieldTable([
    field({ description: "The identifier.", attributes: "Required." }),
  ]);
  assertEquals(
    descriptionCell(lines),
    "[The identifier.]{.schema-para} [Required.]{.schema-attrs}",
  );
  // No blank line anywhere in the row, so no cell holds a second block.
  assertEquals(lines.slice(lines.indexOf("* * `guid`")).indexOf(""), 3);
});

test("fieldTable: attributes alone are one span", () => {
  const lines = fieldTable([field({ attributes: "Read-only." })]);
  assertEquals(descriptionCell(lines), "[Read-only.]{.schema-attrs}");
});

test("fieldTable: paragraphs become spans on one line", () => {
  const lines = fieldTable([
    field({
      description: "First paragraph\nwraps here.\n\nSecond `code` paragraph.",
    }),
  ]);
  assertEquals(
    descriptionCell(lines),
    "[First paragraph wraps here.]{.schema-para} " +
      "[Second `code` paragraph.]{.schema-para}",
  );
});

test("fieldTable: a list moves below the table, and the cell points to it", () => {
  const lines = fieldTable([
    field({
      description: "Accepted values:\n\n- `a`: first\n- `b`: second",
      attributes: "Required.",
    }),
  ]);
  assertEquals(
    descriptionCell(lines),
    "[Accepted values:]{.schema-para} " +
      "[Continued below the table.]{.schema-para} " +
      "[Required.]{.schema-attrs}",
  );
  const output = lines.join("\n");
  assertStringIncludes(
    output,
    [
      "::: {.schema-notes}",
      "",
      "- `guid`:",
      "",
      "  - `a`: first",
      "  - `b`: second",
      "",
      ":::",
    ].join("\n"),
  );
  // The note follows the table rather than sitting inside it.
  assertEquals(
    output.indexOf("::: {.schema-notes}") > output.lastIndexOf(":::\n\n:::"),
    true,
  );
});

test("fieldTable: everything from the first block on moves, in order", () => {
  const lines = fieldTable([
    field({
      description: "Intro.\n\n```json\n{}\n```\n\nAfterword.",
    }),
  ]);
  assertStringIncludes(
    lines.join("\n"),
    "- `guid`:\n\n  ```json\n  {}\n  ```\n\n  Afterword.",
  );
});

test("fieldTable: a hard line break moves with its paragraph", () => {
  const lines = fieldTable([
    field({ description: "Intro.\n\nLine one\\\nline two." }),
  ]);
  assertEquals(
    descriptionCell(lines),
    "[Intro.]{.schema-para} [Continued below the table.]{.schema-para}",
  );
  assertStringIncludes(lines.join("\n"), "  Line one\\\n  line two.");
});

test("fieldTable: nested names keep their indentation class", () => {
  const lines = fieldTable([
    field({ name: "owner", type: "object" }),
    field({ name: "owner.guid", depth: 1 }),
  ]);
  assertStringIncludes(lines.join("\n"), "* * [`owner.guid`]{.schema-nest-1}");
});

test("fieldTable: no rows, no table", () => {
  assertEquals(fieldTable([]), []);
});
