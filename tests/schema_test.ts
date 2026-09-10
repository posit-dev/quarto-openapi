import { test } from "node:test";
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "./assert.ts";
import { renderSchema } from "../_extensions/quarto-openapi/lib/schema.ts";
import type { OpenAPISpec, Schema } from "../_extensions/quarto-openapi/lib/types.ts";

function specWithSchemas(
  schemas: Record<string, Schema> = {},
): OpenAPISpec {
  return {
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0.0" },
    paths: {},
    components: { schemas },
  };
}

function rendered(spec: OpenAPISpec, schema: Schema): string {
  return renderSchema(spec, schema).join("\n");
}

test("renderSchema: simple object produces a table with properties", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: {
      name: { type: "string", description: "The name" },
      age: { type: "integer", description: "Age in years" },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "`name`");
  assertStringIncludes(output, "`string`");
  assertStringIncludes(output, "The name");
  assertStringIncludes(output, "`age`");
  assertStringIncludes(output, "`integer`");
  assertStringIncludes(output, "Age in years");
  // List table markers
  assertStringIncludes(output, '::: {.list-table header-rows="1"');
});

test("renderSchema: nested object flattens with dotted names", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: {
      owner: {
        type: "object",
        description: "The owner",
        properties: {
          name: { type: "string" },
        },
      },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "`owner`");
  assertStringIncludes(output, "`owner.name`");
});

test("renderSchema: array of objects expands item properties", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "Array of objects");
  assertStringIncludes(output, "`id`");
});

test("renderSchema: allOf merges properties from multiple schemas", () => {
  const spec = specWithSchemas({
    Base: {
      type: "object",
      properties: {
        guid: { type: "string" },
      },
    },
  });

  const schema: Schema = {
    allOf: [
      { $ref: "#/components/schemas/Base" } as unknown as Schema,
      {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
    ],
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "`guid`");
  assertStringIncludes(output, "`name`");
});

test("renderSchema: property attributes rendered in description", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    required: ["id"],
    properties: {
      id: {
        type: "string",
        readOnly: true,
        description: "Unique identifier",
      },
      score: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        default: 50,
      },
      status: {
        type: "string",
        enum: ["active", "inactive"],
      },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "Required");
  assertStringIncludes(output, "Read-only");
  assertStringIncludes(output, "Minimum: `0`");
  assertStringIncludes(output, "Maximum: `100`");
  assertStringIncludes(output, "Default: `50`");
  assertStringIncludes(output, "`active`");
  assertStringIncludes(output, "`inactive`");
});

test("renderSchema: $ref in properties resolves correctly", () => {
  const spec = specWithSchemas({
    Tag: {
      type: "object",
      properties: {
        label: { type: "string" },
      },
    },
  });

  const schema: Schema = {
    type: "object",
    properties: {
      tag: { $ref: "#/components/schemas/Tag" } as unknown as Schema,
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "`tag`");
  assertStringIncludes(output, "`tag.label`");
});

test("renderSchema: nested field uses CSS class instead of leading spaces", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: {
      owner: {
        type: "object",
        description: "The owner",
        properties: {
          name: { type: "string" },
        },
      },
    },
  };

  const output = rendered(spec, schema);

  // Nested field should use span class for indentation, not leading spaces
  assertStringIncludes(output, "[`owner.name`]{.schema-nest-1}");
  // Should NOT have leading-space indentation before the backtick
  assert(!output.includes("  `owner.name`"), "should not use space indentation");
});

test("renderSchema: top-level fields have no span wrapper", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: {
      name: { type: "string" },
    },
  };

  const output = rendered(spec, schema);

  // Top-level field should be plain backtick-quoted, not wrapped in a span
  assertStringIncludes(output, "* * `name`");
  assert(!output.includes("{.schema-nest"), "top-level fields should not have nesting class");
});

test("renderSchema: deeper nesting increments class number", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: {
      a: {
        type: "object",
        properties: {
          b: {
            type: "object",
            properties: {
              c: { type: "string" },
            },
          },
        },
      },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "[`a.b`]{.schema-nest-1}");
  assertStringIncludes(output, "[`a.b.c`]{.schema-nest-2}");
});

test("renderSchema: nullable type shows type|null", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: {
      email: { type: "string", nullable: true },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "string|null");
});

test("renderSchema: numeric formats like int32 and double are suppressed", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: {
      count: { type: "integer", format: "int32" },
      bigCount: { type: "integer", format: "int64" },
      score: { type: "number", format: "double" },
      ratio: { type: "number", format: "float" },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "`integer`");
  assertStringIncludes(output, "`number`");
  assert(!output.includes("int32"), "int32 should be suppressed");
  assert(!output.includes("int64"), "int64 should be suppressed");
  assert(!output.includes("double"), "double should be suppressed");
  assert(!output.includes("float"), "float should be suppressed");
});

test("renderSchema: semantic formats like date-time and uuid are shown", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: {
      created: { type: "string", format: "date-time" },
      id: { type: "string", format: "uuid" },
      website: { type: "string", format: "uri" },
      contact: { type: "string", format: "email" },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "string (date-time)");
  assertStringIncludes(output, "string (uuid)");
  assertStringIncludes(output, "string (uri)");
  assertStringIncludes(output, "string (email)");
});

test("renderSchema: nullable with suppressed format renders type|null without parens", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: {
      count: { type: "integer", format: "int64", nullable: true },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "`integer|null`");
  assert(!output.includes("int64"), "int64 should be suppressed even when nullable");
});

test("flattenProperties: $ref-valued map renders map row and recurses into value", () => {
  const spec = specWithSchemas({
    WindowCounts: {
      type: "object",
      properties: { total: { type: "integer", description: "Total" } },
    },
  });
  const schema: Schema = {
    type: "object",
    properties: {
      windows: {
        type: "object",
        description: "Counts by window",
        additionalProperties: { $ref: "#/components/schemas/WindowCounts" },
      },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "`windows`");
  assertStringIncludes(output, "map[string, WindowCounts]");
  assertStringIncludes(output, "Counts by window");
  // recurses into the value schema's properties
  assertStringIncludes(output, "windows{}.total");
  assertStringIncludes(output, "Total");
});

test("flattenProperties: primitive-valued map renders typed map row", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: {
      flags: { type: "object", additionalProperties: { type: "boolean" } },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "`flags`");
  assertStringIncludes(output, "map[string, boolean]");
});

test("flattenProperties: any-valued map renders map[string, any]", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: {
      config: { type: "object", additionalProperties: true },
    },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "`config`");
  assertStringIncludes(output, "map[string, any]");
});

test("renderSchema: top-level $ref map renders 'Map of' and the value table", () => {
  const spec = specWithSchemas({
    WindowCounts: {
      type: "object",
      properties: { total: { type: "integer", description: "Total" } },
    },
  });
  const schema: Schema = {
    type: "object",
    additionalProperties: { $ref: "#/components/schemas/WindowCounts" },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "Map of string to object");
  assertStringIncludes(output, "`total`");
  assertStringIncludes(output, "Total");
});

test("renderSchema: top-level primitive map renders 'Map of string to <type>'", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    additionalProperties: { type: "string" },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "Map of string to string");
});

test("renderSchema: top-level any map renders 'Map of string to any'", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    additionalProperties: true,
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, "Map of string to any");
});

test("renderSchema: an empty-string default renders as a visible empty string", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: { prefix: { type: "string", default: "" } },
  };

  const output = rendered(spec, schema);

  // An empty code span would render as nothing at all
  assertStringIncludes(output, 'Default: `""`');
});

test("renderSchema: enum values go through the same formatter as defaults", () => {
  const spec = specWithSchemas();
  const schema: Schema = {
    type: "object",
    properties: { mode: { type: "string", enum: ["", "fast", null] } },
  };

  const output = rendered(spec, schema);

  assertStringIncludes(output, 'Enum: `""`, `fast`, `null`');
});
