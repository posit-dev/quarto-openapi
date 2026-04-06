import {
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
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

Deno.test("renderSchema: simple object produces a grid table with properties", () => {
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
  // Grid table markers
  assertStringIncludes(output, "+===");
});

Deno.test("renderSchema: nested object flattens with dotted names", () => {
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

Deno.test("renderSchema: array of objects expands item properties", () => {
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

Deno.test("renderSchema: allOf merges properties from multiple schemas", () => {
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

Deno.test("renderSchema: property attributes rendered in description", () => {
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

Deno.test("renderSchema: $ref in properties resolves correctly", () => {
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

Deno.test("renderSchema: nullable type shows type|null", () => {
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
