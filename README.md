# quarto-openapi

A Quarto extension that generates API reference documentation from an OpenAPI 3.x specification.

The extension runs as a pre-render script: it reads your OpenAPI spec and generates a single `.qmd` page with the full API reference. The page includes sections grouped by resource, endpoint details, parameter tables, request/response schemas, and anchor IDs.

## Installation

```bash
quarto add posit-dev/quarto-openapi
```

## Configuration

Add an `openapi` key to your project's `_quarto.yml`:

```yaml
openapi:
  spec: "openapi.json"        # path to your OpenAPI 3.x spec (JSON or YAML)
  output: "api/index.qmd"     # output file path
```

Both fields are required. Add the output file to `.gitignore` since the extension regenerates it on each render.

## Usage

### 1. Provide an OpenAPI 3.x spec

Place your spec file (JSON or YAML) at the path specified in `openapi.spec`. The extension validates that it begins with `openapi: "3."`.

### 2. Render

```bash
quarto render
```

The pre-render script runs automatically before rendering. It:

1. Reads `_quarto.yml` to find the `openapi` configuration
2. Loads and parses the OpenAPI spec
3. Groups endpoints by resource path prefix
4. Generates a single `.qmd` with YAML frontmatter, section headings, and endpoint documentation
5. Quarto then renders the generated page as part of the site

## How sections are determined

Endpoints are grouped by the first path segment after any version prefix. Parameters and the `experimental` prefix are skipped:

| Path                    | Section |
|-------------------------|---------|
| `/board`                | Board   |
| `/board/{row}/{column}` | Board   |


## Example

The `example/` directory contains a working project using the [Tic Tac Toe](https://learn.openapis.org/examples/v3.1/tictactoe.html) spec from the OpenAPI documentation.

The `_quarto.yml` configures the extension:

```yaml
project:
  type: website

website:
  title: "Tic Tac Toe API Docs"

openapi:
  spec: "openapi.json"
  output: "api/index.qmd"
```

Running `quarto render` generates `api/index.qmd` from `openapi.json` and renders it as HTML. The generated page includes:

- A "Board" section (`##`) grouping all `/board` endpoints
- Three endpoints (`###`): Get the whole board, Get a single board square, Set a single board square
- Path parameters (`row`, `column`) inherited from the path item
- Request body schema for the PUT endpoint
- Response tabsets showing 200 and 400 responses with their schemas

## What gets generated

The single output page contains:

- YAML frontmatter with title (from `info.title`) and TOC settings
- Top-level description from the spec's `info.description`
- Sections (`##`) per resource group
- Endpoints (`###`) per operation, each with:
  - Method and path as inline code (e.g., `` `PUT /board/{row}/{column}` ``)
  - Deprecated callout (if `deprecated: true`)
  - Description (may contain rich markdown from the spec)
  - Parameters table grouped by location (path, query, header, cookie)
  - Request body schema table
  - Responses in a tabset (one tab per status code), each with its schema table

Schema tables handle:

- Nested objects: flattened as indented dotted rows (e.g., `owner.guid`)
- Arrays of objects: expanded inline with their properties
- `allOf` composition: merged into a single property table
- Property attributes: required, read-only, nullable, default, minimum/maximum, enum, example, format

## Project structure

```text
quarto-openapi/
  _extensions/
    quarto-openapi/
      _extension.yml            # metadata extension manifest
      openapi-to-markdown.ts    # pre-render entry point (Deno/TypeScript)
      lib/
        types.ts                # OpenAPI 3.0.x type definitions
        refs.ts                 # $ref resolution
        sections.ts             # path grouping and endpoint rendering
        schema.ts               # schema-to-table conversion
        markdown.ts             # grid table and markdown utilities
  example/                      # working example (Tic Tac Toe API)
    _quarto.yml
    openapi.json
```

## Limitations

- OpenAPI 3.x only. Swagger 2.0 specs are not supported. Use a tool like [swagger2openapi](https://github.com/Mermade/oas-kit/tree/main/packages/swagger2openapi) to convert.
- No tag-based grouping. Sections are derived from URL path prefixes. OpenAPI `tags` are not used.
