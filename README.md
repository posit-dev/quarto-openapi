# quarto-openapi

A Quarto extension that generates API reference documentation from an OpenAPI 3.x specification.

The extension runs as a pre-render script: it reads your OpenAPI spec and generates a single `.qmd` page with the full API reference. The page includes sections grouped by resource, endpoint details, parameter tables, request/response schemas, and anchor IDs.

## Requirements

Quarto 1.9 or later, or Quarto 2. Tables are emitted as list tables, which
earlier 1.x releases render as bullet lists.

The pre-render script runs on Node.js 22.6 or later, which Quarto must be able
to find on `PATH` (or via `QUARTO_NODE`), and npm to install its one
dependency. Quarto 2 runs `.ts` render scripts with Node directly; Quarto 1
runs them with its own bundled runtime, which supports the same imports.

## Installation

```bash
quarto add posit-dev/quarto-openapi
npm ci --prefix _extensions/posit-dev/quarto-openapi
```

The second command installs the `yaml` package the pre-render script imports.
Node resolves bare imports from the `node_modules` nearest the script, so it
goes beside the script rather than in your project root. Repeat it after
`quarto update`.

## Configuration

Add an `openapi` key to your project's `_quarto.yml`:

```yaml
openapi:
  spec: "openapi.json"        # path to your OpenAPI 3.x spec (JSON or YAML)
  output: "api/index.qmd"     # output file path
  anchor-style: "operation-id" # anchor ID strategy (default: "operation-id")
```

`spec` and `output` are required. Add the output file to `.gitignore` since the extension regenerates it on each render.

### `anchor-style`

Controls how anchor IDs are generated for endpoint headings. Optional, defaults to `"operation-id"`.

| Value | Anchor source | Example |
|-------|---------------|---------|
| `"operation-id"` | `operationId` field, falling back to method + path | `#listPets` |
| `"path"` | Always method + path (rapidoc-style) | `#get-/v1/pets` |

Use `"path"` when you need stable anchors that don't change when `operationId` values are renamed, or to preserve compatibility with existing links from a RapiDoc-based site.

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
  - Experimental callout (if the `x-experimental: true` extension is set)
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
      openapi-to-markdown.ts    # pre-render entry point (Node/TypeScript)
      package.json              # the script's `yaml` dependency
      package-lock.json         # pinned; `npm ci` installs from it
      lib/
        types.ts                # OpenAPI 3.0.x type definitions
        refs.ts                 # $ref resolution
        sections.ts             # path grouping and endpoint rendering
        schema.ts               # schema-to-table conversion
        markdown.ts             # list table and markdown utilities
        escape.ts               # makes description prose safe as markdown
  tests/                        # node:test suites for lib/
  scripts/
    sync-example.ts             # copies the extension into example/
  example/                      # working example (Tic Tac Toe API)
    _quarto.yml
    openapi.json
```

## Development

```bash
npm install          # dev dependencies: TypeScript and its Node types
npm run setup        # extension dependencies, and the example's copy of them
npm test             # node --test over tests/
npm run typecheck    # tsc --noEmit; Node strips types but never checks them
npm run sync-example # refresh example/_extensions from _extensions
```

`npm run setup` is needed once before `npm run typecheck` or rendering the
example, since both need `yaml` resolvable.

`example/_extensions/posit-dev/quarto-openapi` is a copy of the extension
source at the path `quarto add` installs to, so the example runs the same code
a user gets. Run `npm run sync-example` after changing the extension; CI fails
if the copy is stale. Dependencies are excluded from the copy — the example
installs its own.

Only TypeScript syntax that Node can erase is allowed, since Node strips types
rather than compiling them — no `enum`, `namespace`, or parameter properties.
`tsconfig.json` sets `erasableSyntaxOnly` to catch this at typecheck time.

## How descriptions are escaped

OpenAPI descriptions are CommonMark written for arbitrary renderers, so they
contain constructs Quarto reads as markup. Three rewrites run over them before
anything is rendered, each skipping inline code spans and fenced code blocks:

| In the spec | In the output | Why |
|---|---|---|
| `[start, start+interval)` | `\[start, start+interval)` | an unclosed `[` opens a span, which Quarto 2 rejects |
| `/v1/users/{guid}/keys` | `/v1/users/\{guid\}/keys` | `{...}` is Quarto's attribute syntax |
| `<a href="/x">bundle</a>` | `` `<a href="/x">`{=html}bundle`</a>`{=html} `` | Quarto makes it a raw inline anyway, and warns once per element per page |

All three render identically to the unescaped text. CommonMark autolinks
(`<https://example.com>`, `<user@example.com>`) and comparisons (`a < b`) are
left alone, and braces and brackets inside code render verbatim, so a path
written as `` `GET /v1/users/{guid}/keys` `` keeps its braces.

## Limitations

- OpenAPI 3.x only. Swagger 2.0 specs are not supported. Use a tool like [swagger2openapi](https://github.com/Mermade/oas-kit/tree/main/packages/swagger2openapi) to convert.
