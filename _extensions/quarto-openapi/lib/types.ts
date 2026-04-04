// OpenAPI 3.0.x type definitions
// Reference: https://spec.openapis.org/oas/v3.0.3

export interface OpenAPISpec {
  openapi: string;
  info: Info;
  servers?: Server[];
  paths: Record<string, PathItem>;
  components?: Components;
  security?: SecurityRequirement[];
  tags?: Tag[];
}

export interface Info {
  title: string;
  description?: string;
  version: string;
  contact?: { name?: string; url?: string; email?: string };
  license?: { name: string; url?: string };
}

export interface Server {
  url: string;
  description?: string;
}

export interface Tag {
  name: string;
  description?: string;
}

export interface Components {
  schemas?: Record<string, Schema | Reference>;
  responses?: Record<string, Response | Reference>;
  parameters?: Record<string, Parameter | Reference>;
  requestBodies?: Record<string, RequestBody | Reference>;
  securitySchemes?: Record<string, SecurityScheme>;
}

export interface PathItem {
  summary?: string;
  description?: string;
  get?: Operation;
  put?: Operation;
  post?: Operation;
  delete?: Operation;
  options?: Operation;
  head?: Operation;
  patch?: Operation;
  parameters?: (Parameter | Reference)[];
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: (Parameter | Reference)[];
  requestBody?: RequestBody | Reference;
  responses: Record<string, Response | Reference>;
  security?: SecurityRequirement[];
  deprecated?: boolean;
}

export interface Parameter {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  description?: string;
  required?: boolean;
  schema?: Schema | Reference;
  example?: unknown;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, MediaType>;
}

export interface MediaType {
  schema?: Schema | Reference;
  example?: unknown;
}

export interface Response {
  description: string;
  content?: Record<string, MediaType>;
}

export interface Schema {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, Schema | Reference>;
  required?: string[];
  items?: Schema | Reference;
  allOf?: (Schema | Reference)[];
  oneOf?: (Schema | Reference)[];
  anyOf?: (Schema | Reference)[];
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  nullable?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | Schema | Reference;
}

export interface Reference {
  $ref: string;
}

export interface SecurityRequirement {
  [name: string]: string[];
}

export interface SecurityScheme {
  type: string;
  name?: string;
  in?: string;
  scheme?: string;
  bearerFormat?: string;
}

// Type guards

export function isReference(obj: unknown): obj is Reference {
  return typeof obj === "object" && obj !== null && "$ref" in obj;
}

// HTTP methods in display order
export const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
