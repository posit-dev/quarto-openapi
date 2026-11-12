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

const HIDDEN_OPEN = '::: {.content-hidden when-format="llms-txt"}';
const VISIBLE_OPEN = '::: {.content-visible when-format="llms-txt"}';

/** The table form and the `llms-txt` form, as text. */
function forms(lines: string[]): { table: string; list: string } {
  const text = lines.join("\n");
  const split = text.indexOf(VISIBLE_OPEN);
  return { table: text.slice(0, split), list: text.slice(split) };
}

test("fieldTable: the table is hidden from llms-txt and a list stands in", () => {
  const lines = fieldTable([field({ description: "The identifier." })]);
  assertEquals(lines[0], HIDDEN_OPEN);
  assertEquals(lines.filter((l) => l === VISIBLE_OPEN).length, 1);
  assertEquals(lines.at(-1), ":::");
  const { table, list } = forms(lines);
  assertStringIncludes(table, "* * `guid`\n  * `string`\n  * The identifier.");
  assertStringIncludes(list, "- `guid` (`string`)\n\n  The identifier.");
});

test("fieldTable: attributes follow the description as their own paragraph", () => {
  const { table, list } = forms(
    fieldTable([
      field({ description: "The identifier.", attributes: "Required." }),
    ]),
  );
  assertStringIncludes(table, "  * The identifier.\n\n    Required.");
  assertStringIncludes(list, "  The identifier.\n\n  Required.");
});

test("fieldTable: block content stays in the cell and in the list item", () => {
  const description = [
    "Accepted values:",
    "",
    "- `a`: first",
    "- `b`: second",
    "",
    "```json",
    "{}",
    "```",
  ].join("\n");
  const { table, list } = forms(fieldTable([field({ description })]));
  assertStringIncludes(
    table,
    "  * Accepted values:\n\n    - `a`: first\n    - `b`: second\n\n" +
      "    ```json\n    {}\n    ```",
  );
  assertStringIncludes(
    list,
    "- `guid` (`string`)\n\n  Accepted values:\n\n  - `a`: first\n" +
      "  - `b`: second\n\n  ```json\n  {}\n  ```",
  );
});

test("fieldTable: a field with no details is a bare list item", () => {
  const { list } = forms(fieldTable([field({}), field({ name: "next" })]));
  assertStringIncludes(list, "- `guid` (`string`)\n\n- `next` (`string`)");
});

test("fieldTable: nested names keep their indentation class in the table", () => {
  const { table, list } = forms(
    fieldTable([
      field({ name: "owner", type: "object" }),
      field({ name: "owner.guid", depth: 1 }),
    ]),
  );
  assertStringIncludes(table, "* * [`owner.guid`]{.schema-nest-1}");
  assertStringIncludes(list, "- `owner.guid` (`string`)");
});

test("fieldTable: no rows, no table", () => {
  assertEquals(fieldTable([]), []);
});
