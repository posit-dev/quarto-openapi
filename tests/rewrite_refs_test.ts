import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  rewriteOperationIdRefs,
} from "../_extensions/quarto-openapi/lib/sections.ts";

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
