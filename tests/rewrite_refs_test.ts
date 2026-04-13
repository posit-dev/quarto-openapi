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
