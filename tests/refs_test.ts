import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolve } from "../_extensions/quarto-openapi/lib/refs.ts";
import type { OpenAPISpec, Schema } from "../_extensions/quarto-openapi/lib/types.ts";

function specWithSchemas(
  schemas: Record<string, Schema>,
): OpenAPISpec {
  return {
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0.0" },
    paths: {},
    components: { schemas },
  };
}

Deno.test("resolve expands a $ref to the referenced schema", () => {
  const spec = specWithSchemas({
    Pet: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
    },
  });

  const result = resolve<Schema>(spec, { $ref: "#/components/schemas/Pet" });

  assertEquals(result.type, "object");
  const name = result.properties?.name as Schema;
  assertEquals(name.type, "string");
});

Deno.test("resolve expands nested $refs recursively", () => {
  const spec = specWithSchemas({
    Pet: {
      type: "object",
      properties: {
        owner: { $ref: "#/components/schemas/Owner" } as unknown as Schema,
      },
    },
    Owner: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
    },
  });

  const result = resolve<Schema>(spec, { $ref: "#/components/schemas/Pet" });
  const owner = result.properties?.owner as Schema;

  assertEquals(owner.type, "object");
  const ownerName = owner.properties?.name as Schema;
  assertEquals(ownerName.type, "string");
});

Deno.test("resolve handles circular refs without infinite loop", () => {
  const spec = specWithSchemas({
    Node: {
      type: "object",
      properties: {
        child: { $ref: "#/components/schemas/Node" } as unknown as Schema,
      },
    },
  });

  const result = resolve<Schema>(spec, { $ref: "#/components/schemas/Node" });

  assertEquals(result.type, "object");
  // The circular child should be a stub, not cause a stack overflow
  const child = result.properties?.child as unknown as Schema;
  assertStringIncludes(child.description || "", "circular");
});

Deno.test("resolve passes through non-ref objects unchanged", () => {
  const spec = specWithSchemas({});
  const schema: Schema = { type: "string", description: "a name" };

  const result = resolve<Schema>(spec, schema);

  assertEquals(result.type, "string");
  assertEquals(result.description, "a name");
});
