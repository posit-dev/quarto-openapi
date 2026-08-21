import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  renderApiReferenceBody,
  rewriteOperationIdRefs,
} from "../_extensions/quarto-openapi/lib/sections.ts";
import {
  TABLE_DIV_CLOSE,
  TABLE_DIV_OPEN,
} from "../_extensions/quarto-openapi/lib/markdown.ts";
import type { OpenAPISpec } from "../_extensions/quarto-openapi/lib/types.ts";

Deno.test("rewriteOperationIdRefs: rewrites matching operationId fragment", () => {
  const idToPath = new Map([["listPets", "get-/v1/pets"]]);
  const input = "See [List pets](#listPets) for details.";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, "See [List pets](#get-/v1/pets) for details.");
});

Deno.test("rewriteOperationIdRefs: leaves non-matching fragments unchanged", () => {
  const idToPath = new Map([["listPets", "get-/v1/pets"]]);
  const input = "See [other](#someOtherSection) for details.";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, input);
});

Deno.test("rewriteOperationIdRefs: rewrites multiple fragments in one string", () => {
  const idToPath = new Map([
    ["listPets", "get-/v1/pets"],
    ["createPet", "post-/v1/pets"],
  ]);
  const input = "See (#listPets) and (#createPet).";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, "See (#get-/v1/pets) and (#post-/v1/pets).");
});

Deno.test("rewriteOperationIdRefs: handles operationIds with hyphens", () => {
  const idToPath = new Map([["list-pets", "get-/v1/pets"]]);
  const input = "See [List pets](#list-pets).";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, "See [List pets](#get-/v1/pets).");
});

Deno.test("rewriteOperationIdRefs: handles operationIds with dots", () => {
  const idToPath = new Map([["pets.list", "get-/v1/pets"]]);
  const input = "See (#pets.list).";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, "See (#get-/v1/pets).");
});

Deno.test("rewriteOperationIdRefs: no-op on empty map", () => {
  const idToPath = new Map<string, string>();
  const input = "See (#listPets).";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, input);
});

Deno.test("rewriteOperationIdRefs: skips fragments inside fenced code blocks", () => {
  const idToPath = new Map([["listPets", "get-/v1/pets"]]);
  const input = "```\nSee (#listPets).\n```";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, input);
});

Deno.test("rewriteOperationIdRefs: skips fragments inside inline code", () => {
  const idToPath = new Map([["listPets", "get-/v1/pets"]]);
  const input = "Use `(#listPets)` in your link.";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, input);
});

Deno.test("rewriteOperationIdRefs: rewrites outside code but not inside", () => {
  const idToPath = new Map([["listPets", "get-/v1/pets"]]);
  const input = "See [pets](#listPets). Example: `(#listPets)`";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, "See [pets](#get-/v1/pets). Example: `(#listPets)`");
});

Deno.test("rewriteOperationIdRefs: rewrites between fenced code blocks", () => {
  const idToPath = new Map([["listPets", "get-/v1/pets"]]);
  const input = "```\n(#listPets)\n```\n\nSee (#listPets).\n\n```\n(#listPets)\n```";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, "```\n(#listPets)\n```\n\nSee (#get-/v1/pets).\n\n```\n(#listPets)\n```");
});

Deno.test("rewriteOperationIdRefs: inner triple-backtick does not close a longer fence", () => {
  const idToPath = new Map([["listPets", "get-/v1/pets"]]);
  const input = "````\n```\n(#listPets)\n```\n````";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, input);
});

Deno.test("rewriteOperationIdRefs: fence opener with info string does not close fence", () => {
  const idToPath = new Map([["listPets", "get-/v1/pets"]]);
  const input = "```\n````js\n(#listPets)\n````\n```";
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, input);
});

Deno.test("rewriteOperationIdRefs: quarto-style fenced code block skips content", () => {
  const idToPath = new Map([["listPets", "get-/v1/pets"]]);
  const input = '```{python}\n# see (#listPets)\nprint("hello")\n```';
  const result = rewriteOperationIdRefs(input, idToPath);
  assertEquals(result, input);
});

function specWithRequestBodyDescription(description: string): OpenAPISpec {
  return {
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0.0" },
    paths: {
      "/v1/pets": {
        get: {
          operationId: "listPets",
          responses: { "200": { description: "OK" } },
        },
      },
      "/v1/adoptions": {
        post: {
          operationId: "createAdoption",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["pet_id"],
                  properties: {
                    pet_id: { type: "string", description },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
    },
  };
}

function findTableBlocks(text: string): string[][] {
  const lines = text.split("\n");
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === TABLE_DIV_OPEN) {
      current = [];
      continue;
    }
    if (line === TABLE_DIV_CLOSE && current !== null) {
      blocks.push(current);
      current = null;
      continue;
    }
    if (current !== null) current.push(line);
  }
  return blocks;
}

Deno.test("renderApiReferenceBody: rewritten link in a request body table stays well-formed", () => {
  const spec = specWithRequestBodyDescription(
    "The ID of the pet to adopt. Obtain it from the " +
      "[GET /v1/pets](#listPets) endpoint before creating an adoption.",
  );
  spec.info.description = "See [pet listing](#listPets).";

  const output = renderApiReferenceBody(spec, "path").join("\n") + "\n";

  const block = findTableBlocks(output).find((b) => b.some((l) => l.includes("pet_id")));
  assert(block, "expected to find the pet_id property table in the rendered output");
  for (const line of block) {
    assertEquals(line.length, block[0].length, `off-width line: ${JSON.stringify(line)}`);
  }
  assert(
    block.some((l) => l.includes("#get-/v1/pets")),
    "expected the operationId anchor to be rewritten to its path-style form",
  );

  // main() renders spec.info.description after this call, so the rewrite must be in place.
  assertEquals(
    spec.info.description,
    "See [pet listing](#get-/v1/pets).",
    "spec.info.description should be rewritten in place",
  );
});
