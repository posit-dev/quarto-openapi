import {
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  groupByResource,
  renderSection,
  type RenderOptions,
} from "../_extensions/quarto-openapi/lib/sections.ts";
import type { OpenAPISpec } from "../_extensions/quarto-openapi/lib/types.ts";

function minimalSpec(paths: OpenAPISpec["paths"]): OpenAPISpec {
  return {
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0.0" },
    paths,
  };
}

function renderedSection(spec: OpenAPISpec, sectionIndex = 0): string {
  const sections = groupByResource(spec);
  return renderSection(spec, sections[sectionIndex]).join("\n");
}

Deno.test("renderSection: section heading uses tag name", () => {
  const spec = minimalSpec({
    "/v1/pets": {
      get: {
        operationId: "listPets",
        summary: "List pets",
        tags: ["Pets"],
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const output = renderedSection(spec);

  assertStringIncludes(output, "## Pets");
});

Deno.test("renderSection: endpoint heading uses summary and operationId anchor", () => {
  const spec = minimalSpec({
    "/v1/pets": {
      get: {
        operationId: "listPets",
        summary: "List all pets",
        tags: ["Pets"],
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const output = renderedSection(spec);

  assertStringIncludes(output, '### List all pets {id="listPets"}');
  assertStringIncludes(output, "`GET /v1/pets`");
});

Deno.test("renderSection: deprecated endpoint shows callout", () => {
  const spec = minimalSpec({
    "/v1/old": {
      get: {
        operationId: "oldEndpoint",
        summary: "Old endpoint",
        deprecated: true,
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const output = renderedSection(spec);

  assertStringIncludes(output, ".callout-warning");
  assertStringIncludes(output, "deprecated");
});

Deno.test("renderSection: parameters rendered as grid table", () => {
  const spec = minimalSpec({
    "/v1/pets": {
      get: {
        operationId: "listPets",
        summary: "List pets",
        parameters: [
          {
            name: "limit",
            in: "query",
            description: "Max items",
            schema: { type: "integer" },
          },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const output = renderedSection(spec);

  assertStringIncludes(output, "#### Parameters");
  assertStringIncludes(output, "`limit`");
  assertStringIncludes(output, "Max items");
});

Deno.test("renderSection: parameters heading has scoped anchor ID", () => {
  const spec = minimalSpec({
    "/v1/pets": {
      get: {
        operationId: "listPets",
        summary: "List pets",
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer" },
          },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const output = renderedSection(spec);

  assertStringIncludes(output, '#### Parameters {id="listPets-parameters"}');
});

Deno.test("renderSection: request body schema rendered", () => {
  const spec = minimalSpec({
    "/v1/pets": {
      post: {
        operationId: "createPet",
        summary: "Create a pet",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Pet name" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
  });

  const output = renderedSection(spec);

  assertStringIncludes(output, "#### Request body");
  assertStringIncludes(output, "`name`");
  assertStringIncludes(output, "Pet name");
});

Deno.test("renderSection: request body heading has scoped anchor ID", () => {
  const spec = minimalSpec({
    "/v1/pets": {
      post: {
        operationId: "createPet",
        summary: "Create a pet",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
  });

  const output = renderedSection(spec);

  assertStringIncludes(output, '#### Request body {id="createPet-request-body"}');
});

Deno.test("renderSection: responses heading has scoped anchor ID", () => {
  const spec = minimalSpec({
    "/v1/pets": {
      get: {
        operationId: "listPets",
        summary: "List pets",
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const output = renderedSection(spec);

  assertStringIncludes(output, '#### Responses {id="listPets-responses"}');
});

Deno.test("renderSection: multiple responses render as tabset", () => {
  const spec = minimalSpec({
    "/v1/pets/{id}": {
      get: {
        operationId: "getPet",
        summary: "Get a pet",
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not found" },
        },
      },
    },
  });

  const output = renderedSection(spec);

  assertStringIncludes(output, ".panel-tabset");
  assertStringIncludes(output, "**200**: OK");
  assertStringIncludes(output, "**404**: Not found");
});

Deno.test("renderSection: response code tab headings have scoped anchor IDs", () => {
  const spec = minimalSpec({
    "/v1/pets/{id}": {
      get: {
        operationId: "getPet",
        summary: "Get a pet",
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not found" },
        },
      },
    },
  });

  const output = renderedSection(spec);

  assertStringIncludes(output, '##### 200 {id="getPet-200"}');
  assertStringIncludes(output, '##### 404 {id="getPet-404"}');
});

Deno.test("renderSection: sub-heading anchors fall back to method+path slug without operationId", () => {
  const spec = minimalSpec({
    "/v1/pets": {
      get: {
        summary: "List pets",
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "400": { description: "Bad request" },
        },
      },
    },
  });

  const output = renderedSection(spec);

  // Endpoint heading uses path-based anchor
  assertStringIncludes(output, '{id="get-/v1/pets"}');
  // Sub-headings use the same slug as prefix
  assertStringIncludes(output, '#### Parameters {id="get-/v1/pets-parameters"}');
  assertStringIncludes(output, '#### Responses {id="get-/v1/pets-responses"}');
  assertStringIncludes(output, '##### 200 {id="get-/v1/pets-200"}');
  assertStringIncludes(output, '##### 400 {id="get-/v1/pets-400"}');
});

Deno.test("renderSection: anchor-style path forces path anchors even with operationId", () => {
  const spec = minimalSpec({
    "/v1/pets": {
      get: {
        operationId: "listPets",
        summary: "List all pets",
        tags: ["Pets"],
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const sections = groupByResource(spec);
  const output = renderSection(spec, sections[0], { anchorStyle: "path" }).join("\n");

  assertStringIncludes(output, '{id="get-/v1/pets"}');
});

Deno.test("renderSection: anchor-style path propagates to sub-anchors", () => {
  const spec = minimalSpec({
    "/v1/pets": {
      get: {
        operationId: "listPets",
        summary: "List all pets",
        tags: ["Pets"],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          "200": { description: "OK" },
          "400": { description: "Bad request" },
        },
      },
    },
  });

  const sections = groupByResource(spec);
  const output = renderSection(spec, sections[0], { anchorStyle: "path" }).join("\n");

  assertStringIncludes(output, '#### Parameters {id="get-/v1/pets-parameters"}');
  assertStringIncludes(output, '#### Responses {id="get-/v1/pets-responses"}');
  assertStringIncludes(output, '##### 200 {id="get-/v1/pets-200"}');
  assertStringIncludes(output, '##### 400 {id="get-/v1/pets-400"}');
});

Deno.test("renderSection: explicit anchor-style operation-id uses operationId", () => {
  const spec = minimalSpec({
    "/v1/pets": {
      get: {
        operationId: "listPets",
        summary: "List all pets",
        tags: ["Pets"],
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const sections = groupByResource(spec);
  const output = renderSection(spec, sections[0], { anchorStyle: "operation-id" }).join("\n");

  assertStringIncludes(output, '{id="listPets"}');
});

Deno.test("renderSection: path-level parameters merged into operations", () => {
  const spec: OpenAPISpec = {
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0.0" },
    paths: {
      "/v1/pets/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Pet ID",
            schema: { type: "string" },
          },
        ],
        get: {
          operationId: "getPet",
          summary: "Get a pet",
          responses: { "200": { description: "OK" } },
        },
      },
    },
  };

  const output = renderedSection(spec);

  assertStringIncludes(output, "`id`");
  assertStringIncludes(output, "Pet ID");
});

Deno.test("renderSection: untagged fallback section heading is title-cased", () => {
  const spec = minimalSpec({
    "/v1/audit_logs": {
      get: {
        operationId: "listAuditLogs",
        summary: "List audit logs",
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const output = renderedSection(spec);

  // Path prefix "audit-logs" should render as "Audit Logs", not "audit-logs"
  assertStringIncludes(output, "## Audit Logs");
});

Deno.test("renderSection: description headings shift below endpoint level", () => {
  const spec = minimalSpec({
    "/v1/users": {
      get: {
        operationId: "listUsers",
        summary: "List users",
        description: "### CSV export\n\nExport users as CSV.",
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const output = renderedSection(spec);

  // The ### in the description should become #### (one below the endpoint h3)
  assertStringIncludes(output, "#### CSV export");
});

Deno.test("renderSection: description heading hierarchy is preserved", () => {
  const spec = minimalSpec({
    "/v1/users": {
      get: {
        operationId: "listUsers",
        summary: "List users",
        description:
          "### CSV export\n\nExport as CSV.\n\n#### Filters\n\nFilter options.",
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const output = renderedSection(spec);

  // ### -> ####, #### -> #####
  assertStringIncludes(output, "#### CSV export");
  assertStringIncludes(output, "##### Filters");
});

Deno.test("renderSection: description without headings passes through unchanged", () => {
  const spec = minimalSpec({
    "/v1/users": {
      get: {
        operationId: "listUsers",
        summary: "List users",
        description: "Returns a list of users.\n\nSupports pagination.",
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const output = renderedSection(spec);

  assertStringIncludes(output, "Returns a list of users.\n\nSupports pagination.");
});

Deno.test("renderSection: headings inside code blocks are not shifted", () => {
  const spec = minimalSpec({
    "/v1/users": {
      get: {
        operationId: "listUsers",
        summary: "List users",
        description:
          "### Examples\n\n```markdown\n### This is a code sample\n```",
        responses: { "200": { description: "OK" } },
      },
    },
  });

  const output = renderedSection(spec);

  // The real heading shifts, but the one inside the code fence should not
  assertStringIncludes(output, "#### Examples");
  assertStringIncludes(output, "```markdown\n### This is a code sample\n```");
});
