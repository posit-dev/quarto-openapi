/**
 * Group OpenAPI spec paths by resource prefix and render endpoint
 * documentation as markdown sections.
 */

import type {
  OpenAPISpec,
  PathItem,
  Operation,
  Parameter,
  RequestBody,
  Response,
  Schema,
  HttpMethod,
} from "./types.ts";
import { HTTP_METHODS, isReference } from "./types.ts";
import { resolve } from "./refs.ts";
import { renderSchema } from "./schema.ts";
import {
  heading,
  methodBadge,
  pathToAnchor,
  gridTable,
  type TableRow,
} from "./markdown.ts";

export interface Section {
  /** Resource name, e.g., "content", "bundles" */
  name: string;
  /** All endpoints in this section */
  endpoints: Endpoint[];
}

export interface Endpoint {
  method: HttpMethod;
  path: string;
  operation: Operation;
}

/**
 * Extract the resource name from a path.
 * /v1/content/{guid}/bundles -> "content"
 * /v1/audit_logs -> "audit-logs"
 * /v1/experimental/groups/{guid}/content -> "groups"
 * /board/{row}/{column} -> "board"
 */
function resourceName(path: string): string {
  const segments = path.split("/").filter(Boolean);

  // Skip version prefix (v1, v2, etc.) and "experimental"
  let start = 0;
  if (segments.length > 0 && /^v\d+$/.test(segments[0])) {
    start = 1;
  }
  if (segments[start] === "experimental") {
    start++;
  }

  // Use the first non-parameter segment as the resource name
  const segment = segments[start];
  if (!segment || segment.startsWith("{")) return "root";

  return segment.replace(/_/g, "-");
}

/**
 * Title-case a dash-separated string.
 * "audit-logs" -> "Audit Logs"
 */
function titleCase(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Group all paths in the spec into sections.
 *
 * When operations have tags, group by the first tag on each operation.
 * Sections appear in the order their tag is first encountered in the spec.
 * Operations without tags fall back to path-prefix grouping.
 */
export function groupByResource(spec: OpenAPISpec): Section[] {
  // Use a Map to preserve insertion order (first-seen tag order).
  const sectionMap = new Map<string, Endpoint[]>();

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const resolved = isReference(pathItem)
      ? resolve<PathItem>(spec, pathItem)
      : pathItem;

    for (const method of HTTP_METHODS) {
      const operation = resolved[method];
      if (!operation) continue;

      // Merge path-level parameters into operation parameters.
      // Operation parameters override path-level ones with the same name+in.
      if (resolved.parameters && resolved.parameters.length > 0) {
        const opParams = (operation.parameters || []).map((p) =>
          isReference(p) ? resolve<Parameter>(spec, p) : p
        );
        const opParamKeys = new Set(
          opParams.map((p) => `${p.in}:${p.name}`),
        );
        const pathParams = resolved.parameters
          .map((p) => (isReference(p) ? resolve<Parameter>(spec, p) : p))
          .filter((p) => !opParamKeys.has(`${p.in}:${p.name}`));

        operation.parameters = [...pathParams, ...opParams];
      }

      // Determine section: first tag if present, otherwise title-cased path prefix.
      const sectionName =
        operation.tags && operation.tags.length > 0
          ? operation.tags[0]
          : titleCase(resourceName(path));

      if (!sectionMap.has(sectionName)) {
        sectionMap.set(sectionName, []);
      }
      sectionMap.get(sectionName)!.push({ method, path, operation });
    }
  }

  // Determine section order: use spec.tags when present, otherwise first-seen.
  const orderedNames: string[] = [];
  if (spec.tags && spec.tags.length > 0) {
    for (const tag of spec.tags) {
      if (sectionMap.has(tag.name)) {
        orderedNames.push(tag.name);
      }
    }
    // Append any tags not listed in spec.tags (first-seen order).
    for (const name of sectionMap.keys()) {
      if (!orderedNames.includes(name)) {
        orderedNames.push(name);
      }
    }
  } else {
    orderedNames.push(...sectionMap.keys());
  }

  // Sort endpoints within each section by path then method.
  const sections: Section[] = [];
  for (const name of orderedNames) {
    const endpoints = sectionMap.get(name)!;
    endpoints.sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      return HTTP_METHODS.indexOf(a.method) - HTTP_METHODS.indexOf(b.method);
    });
    sections.push({ name, endpoints });
  }

  return sections;
}

/**
 * Render a section with a ## heading and ### per endpoint.
 */
export function renderSection(spec: OpenAPISpec, section: Section): string[] {
  const lines: string[] = [];

  lines.push(heading(2, section.name));
  lines.push("");

  for (const endpoint of section.endpoints) {
    lines.push(...renderEndpoint(spec, endpoint));
    lines.push("");
  }

  return lines;
}

/**
 * Shift markdown headings in a description so the highest heading
 * becomes h4 (one level below the endpoint h3).
 * Headings inside fenced code blocks are left untouched.
 */
function shiftHeadings(description: string): string {
  const lines = description.split("\n");
  const headingRe = /^(#{1,6})\s/;

  // First pass: find minimum heading level outside code fences.
  let minLevel = 7;
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = headingRe.exec(line);
    if (m) minLevel = Math.min(minLevel, m[1].length);
  }

  if (minLevel >= 7) return description; // no headings found

  const shift = 4 - minLevel;
  if (shift <= 0) return description;

  // Second pass: shift headings outside code fences.
  inFence = false;
  const result = lines.map((line) => {
    if (/^```/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return line.replace(headingRe, (_full, hashes: string) => {
      const newLevel = Math.min(hashes.length + shift, 6);
      return "#".repeat(newLevel) + " ";
    });
  });

  return result.join("\n");
}

function renderEndpoint(spec: OpenAPISpec, endpoint: Endpoint): string[] {
  const { method, path, operation } = endpoint;
  const title = operation.summary || `${methodBadge(method)} ${path}`;
  const anchor = operation.operationId || pathToAnchor(method, path);

  const lines: string[] = [];

  // Heading
  lines.push(heading(3, title, anchor));
  lines.push("");

  // Method + path
  lines.push(`\`${methodBadge(method)} ${path}\``);
  lines.push("");

  // Deprecated badge
  if (operation.deprecated) {
    lines.push("::: {.callout-warning}");
    lines.push("This endpoint is deprecated.");
    lines.push(":::");
    lines.push("");
  }

  // Description — shift headings so they nest below the endpoint h3
  if (operation.description) {
    lines.push(shiftHeadings(operation.description));
    lines.push("");
  }

  // Parameters
  const paramLines = renderParameters(spec, operation, path);
  if (paramLines.length > 0) {
    lines.push(heading(4, "Parameters", `${anchor}-parameters`));
    lines.push("");
    lines.push(...paramLines);
    lines.push("");
  }

  // Request body
  const bodyLines = renderRequestBody(spec, operation);
  if (bodyLines.length > 0) {
    lines.push(heading(4, "Request body", `${anchor}-request-body`));
    lines.push("");
    lines.push(...bodyLines);
    lines.push("");
  }

  // Responses
  const responseLines = renderResponses(spec, operation, anchor);
  if (responseLines.length > 0) {
    lines.push(heading(4, "Responses", `${anchor}-responses`));
    lines.push("");
    lines.push(...responseLines);
    lines.push("");
  }

  return lines;
}

function renderParameters(
  spec: OpenAPISpec,
  operation: Operation,
  _path: string,
): string[] {
  if (!operation.parameters || operation.parameters.length === 0) return [];

  // Group parameters by location
  const groups = new Map<string, Parameter[]>();
  for (const p of operation.parameters) {
    const param = isReference(p) ? resolve<Parameter>(spec, p) : p;
    const location = param.in;
    if (!groups.has(location)) groups.set(location, []);
    groups.get(location)!.push(param);
  }

  const lines: string[] = [];
  const locationOrder = ["path", "query", "header", "cookie"];

  for (const location of locationOrder) {
    const params = groups.get(location);
    if (!params) continue;

    if (groups.size > 1) {
      lines.push(`**${capitalize(location)} parameters**`);
      lines.push("");
    }

    const rows: TableRow[] = params.map((param) => {
      const schema = param.schema
        ? resolve<Schema>(spec, param.schema)
        : undefined;

      const typeParts: string[] = [];
      if (schema?.type) typeParts.push(schema.type);
      if (schema?.format) typeParts.push(`(${schema.format})`);
      const typeStr = typeParts.length > 0 ? typeParts.join(" ") : "string";

      const descParts: string[] = [];
      if (param.description) descParts.push(param.description.trim());
      if (param.required) descParts.push("Required.");

      return {
        cells: [
          `\`${param.name}\``,
          `\`${typeStr}\``,
          descParts.join(" "),
        ],
      };
    });

    lines.push(...gridTable(["Name", "Type", "Description"], rows));
    lines.push("");
  }

  return lines;
}

function renderRequestBody(
  spec: OpenAPISpec,
  operation: Operation,
): string[] {
  if (!operation.requestBody) return [];

  const body = isReference(operation.requestBody)
    ? resolve<RequestBody>(spec, operation.requestBody)
    : operation.requestBody;

  const lines: string[] = [];

  if (body.description) {
    lines.push(body.description);
    lines.push("");
  }

  if (!body.content) return lines;

  // Render the schema for each content type (usually just application/json)
  for (const [contentType, mediaType] of Object.entries(body.content)) {
    if (Object.keys(body.content).length > 1) {
      lines.push(`**${contentType}**`);
      lines.push("");
    }
    if (mediaType.schema) {
      lines.push(...renderSchema(spec, mediaType.schema));
      lines.push("");
    }
  }

  return lines;
}

function renderResponses(
  spec: OpenAPISpec,
  operation: Operation,
  anchor: string,
): string[] {
  const entries = Object.entries(operation.responses).sort(
    ([a], [b]) => a.localeCompare(b),
  );

  if (entries.length === 0) return [];

  // If there's only one response, render it inline
  if (entries.length === 1) {
    const [code, resp] = entries[0];
    const response = isReference(resp)
      ? resolve<Response>(spec, resp)
      : resp;
    return renderSingleResponse(spec, code, response);
  }

  // Multiple responses: use a tabset
  const tabs = entries.map(([code, resp]) => {
    const response = isReference(resp)
      ? resolve<Response>(spec, resp)
      : resp;
    return {
      label: code,
      content: renderSingleResponse(spec, code, response),
    };
  });

  return [
    "::: {.panel-tabset}",
    "",
    ...tabs.flatMap((tab) => [
      heading(5, tab.label, `${anchor}-${tab.label}`),
      "",
      ...tab.content,
      "",
    ]),
    ":::",
  ];
}

function renderSingleResponse(
  spec: OpenAPISpec,
  code: string,
  response: Response,
): string[] {
  const lines: string[] = [];

  lines.push(`**${code}**: ${response.description}`);
  lines.push("");

  if (response.content) {
    for (const [_contentType, mediaType] of Object.entries(response.content)) {
      if (mediaType.schema) {
        lines.push(...renderSchema(spec, mediaType.schema));
        lines.push("");
      }
    }
  }

  return lines;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
