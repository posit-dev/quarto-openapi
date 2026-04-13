import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { groupByResource, buildOperationIdToPathMap, rewriteOperationIdRefs } from "../_extensions/quarto-openapi/lib/sections.ts";
import type { OpenAPISpec } from "../_extensions/quarto-openapi/lib/types.ts";

function minimalSpec(paths: OpenAPISpec["paths"]): OpenAPISpec {
  return {
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0.0" },
    paths,
  };
}

Deno.test("operations with tags group by first tag", () => {
  const spec = minimalSpec({
    "/v1/content": {
      get: {
        operationId: "listContent",
        summary: "List content",
        tags: ["Content"],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/content/{guid}": {
      get: {
        operationId: "getContent",
        summary: "Get content",
        tags: ["Content"],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/users": {
      get: {
        operationId: "listUsers",
        summary: "List users",
        tags: ["Users"],
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const sections = groupByResource(spec);

  assertEquals(sections.length, 2);
  assertEquals(sections[0].name, "Content");
  assertEquals(sections[0].endpoints.length, 2);
  assertEquals(sections[1].name, "Users");
  assertEquals(sections[1].endpoints.length, 1);
});

Deno.test("section ordering matches first-seen tag order in paths", () => {
  const spec = minimalSpec({
    "/v1/users": {
      get: {
        operationId: "listUsers",
        summary: "List users",
        tags: ["Users"],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/content": {
      get: {
        operationId: "listContent",
        summary: "List content",
        tags: ["Content"],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/content/{guid}": {
      get: {
        operationId: "getContent",
        summary: "Get content",
        tags: ["Content"],
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const sections = groupByResource(spec);
  const names = sections.map((s) => s.name);

  // Users appears first in paths, so it should be the first section
  assertEquals(names, ["Users", "Content"]);
});

Deno.test("operations without tags fall back to path-prefix grouping", () => {
  const spec = minimalSpec({
    "/v1/content": {
      get: {
        operationId: "listContent",
        summary: "List content",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/content/{guid}": {
      delete: {
        operationId: "deleteContent",
        summary: "Delete content",
        responses: { "204": { description: "Deleted" } },
      },
    },
    "/board": {
      get: {
        operationId: "getBoard",
        summary: "Get board",
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const sections = groupByResource(spec);

  assertEquals(sections.length, 2);
  assertEquals(sections[0].name, "Content");
  assertEquals(sections[0].endpoints.length, 2);
  assertEquals(sections[1].name, "Board");
  assertEquals(sections[1].endpoints.length, 1);
});

Deno.test("mixed spec: tagged and untagged operations coexist", () => {
  const spec = minimalSpec({
    "/v1/content": {
      get: {
        operationId: "listContent",
        summary: "List content",
        tags: ["Content"],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/internal/health": {
      get: {
        operationId: "healthCheck",
        summary: "Health check",
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const sections = groupByResource(spec);

  assertEquals(sections.length, 2);
  assertEquals(sections[0].name, "Content");
  assertEquals(sections[1].name, "Internal");
});

Deno.test("top-level tags array controls section order", () => {
  const spec: OpenAPISpec = {
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0.0" },
    tags: [{ name: "Zebras" }, { name: "Aardvarks" }],
    paths: {
      "/v1/aardvarks": {
        get: {
          operationId: "listAardvarks",
          summary: "List aardvarks",
          tags: ["Aardvarks"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/v1/zebras": {
        get: {
          operationId: "listZebras",
          summary: "List zebras",
          tags: ["Zebras"],
          responses: { "200": { description: "OK" } },
        },
      },
    },
  };

  const sections = groupByResource(spec);
  const names = sections.map((s) => s.name);

  // spec.tags puts Zebras first, even though Aardvarks is first-seen in paths
  assertEquals(names, ["Zebras", "Aardvarks"]);
});

Deno.test("unused tags in spec.tags do not produce empty sections", () => {
  const spec: OpenAPISpec = {
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0.0" },
    tags: [{ name: "Users" }, { name: "Archived" }, { name: "Content" }],
    paths: {
      "/v1/users": {
        get: {
          operationId: "listUsers",
          summary: "List users",
          tags: ["Users"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/v1/content": {
        get: {
          operationId: "listContent",
          summary: "List content",
          tags: ["Content"],
          responses: { "200": { description: "OK" } },
        },
      },
    },
  };

  const sections = groupByResource(spec);
  const names = sections.map((s) => s.name);

  // "Archived" has no operations, so it should be omitted
  assertEquals(names, ["Users", "Content"]);
});

Deno.test("operations with tags not in spec.tags appear at the end", () => {
  const spec: OpenAPISpec = {
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0.0" },
    tags: [{ name: "Content" }],
    paths: {
      "/v1/users": {
        get: {
          operationId: "listUsers",
          summary: "List users",
          tags: ["Users"],
          responses: { "200": { description: "OK" } },
        },
      },
      "/v1/content": {
        get: {
          operationId: "listContent",
          summary: "List content",
          tags: ["Content"],
          responses: { "200": { description: "OK" } },
        },
      },
    },
  };

  const sections = groupByResource(spec);
  const names = sections.map((s) => s.name);

  // Content is in spec.tags so it comes first; Users is unlisted so it's appended
  assertEquals(names, ["Content", "Users"]);
});

Deno.test("tictactoe spec groups by tag Gameplay, not path board", () => {
  const spec = minimalSpec({
    "/board": {
      get: {
        operationId: "get-board",
        summary: "Get the whole board",
        tags: ["Gameplay"],
        responses: { "200": { description: "OK" } },
      },
    },
    "/board/{row}/{column}": {
      get: {
        operationId: "get-square",
        summary: "Get a single board square",
        tags: ["Gameplay"],
        responses: { "200": { description: "OK" } },
      },
      put: {
        operationId: "put-square",
        summary: "Set a single board square",
        tags: ["Gameplay"],
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const sections = groupByResource(spec);

  assertEquals(sections.length, 1);
  assertEquals(sections[0].name, "Gameplay");
  assertEquals(sections[0].endpoints.length, 3);
});

Deno.test("buildOperationIdToPathMap maps operationIds to path-style anchors", () => {
  const spec = minimalSpec({
    "/v1/content": {
      get: {
        operationId: "getContents",
        summary: "List content",
        responses: { "200": { description: "OK" } },
      },
      post: {
        operationId: "createContent",
        summary: "Create content",
        responses: { "201": { description: "Created" } },
      },
    },
    "/v1/content/{guid}": {
      get: {
        operationId: "getContent",
        summary: "Get content",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/tasks/{id}": {
      get: {
        operationId: "getTask",
        summary: "Get task",
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const map = buildOperationIdToPathMap(spec);

  assertEquals(map.get("getContents"), "get-/v1/content");
  assertEquals(map.get("createContent"), "post-/v1/content");
  assertEquals(map.get("getContent"), "get-/v1/content/-guid-");
  assertEquals(map.get("getTask"), "get-/v1/tasks/-id-");
  assertEquals(map.has("nonExistent"), false);
});

Deno.test("rewriteOperationIdRefs rewrites operationId fragments to path-style", () => {
  const idToPath = new Map([
    ["getTask", "get-/v1/tasks/-id-"],
    ["createGroup", "post-/v1/groups"],
    ["getUsers", "get-/v1/users"],
  ]);

  const input = "See [Get Task](#getTask) and [Create Group](#createGroup) for details.";
  const expected = "See [Get Task](#get-/v1/tasks/-id-) and [Create Group](#post-/v1/groups) for details.";

  assertEquals(rewriteOperationIdRefs(input, idToPath), expected);
});

Deno.test("rewriteOperationIdRefs does not rewrite unknown IDs", () => {
  const idToPath = new Map([
    ["getTask", "get-/v1/tasks/-id-"],
  ]);

  const input = "See [Authorization](#Authorization) section.";
  assertEquals(rewriteOperationIdRefs(input, idToPath), input);
});

Deno.test("rewriteOperationIdRefs handles multiple occurrences", () => {
  const idToPath = new Map([
    ["getTask", "get-/v1/tasks/-id-"],
  ]);

  const input = "Call (#getTask) first, then (#getTask) again.";
  const expected = "Call (#get-/v1/tasks/-id-) first, then (#get-/v1/tasks/-id-) again.";

  assertEquals(rewriteOperationIdRefs(input, idToPath), expected);
});

Deno.test("rewriteOperationIdRefs skips content inside fenced code blocks", () => {
  const idToPath = new Map([
    ["getTask", "get-/v1/tasks/-id-"],
  ]);

  const input = [
    "Before (#getTask).",
    "```",
    "Do not rewrite (#getTask) inside fences.",
    "```",
    "After (#getTask).",
  ].join("\n");
  const expected = [
    "Before (#get-/v1/tasks/-id-).",
    "```",
    "Do not rewrite (#getTask) inside fences.",
    "```",
    "After (#get-/v1/tasks/-id-).",
  ].join("\n");

  assertEquals(rewriteOperationIdRefs(input, idToPath), expected);
});

Deno.test("rewriteOperationIdRefs skips content inside inline code spans", () => {
  const idToPath = new Map([
    ["getTask", "get-/v1/tasks/-id-"],
  ]);

  const input = "Use `(#getTask)` literally, but rewrite (#getTask) outside.";
  const expected = "Use `(#getTask)` literally, but rewrite (#get-/v1/tasks/-id-) outside.";

  assertEquals(rewriteOperationIdRefs(input, idToPath), expected);
});
