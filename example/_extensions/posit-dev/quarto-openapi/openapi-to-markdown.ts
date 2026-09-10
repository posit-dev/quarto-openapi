#!/usr/bin/env node

/**
 * Pre-render script for the quarto-openapi extension.
 *
 * Reads an OpenAPI 3.x spec and generates a single .qmd file
 * with the full API reference.
 *
 * Runs under node (>= 22.6, for TypeScript type stripping). The `yaml`
 * dependency is installed in this extension's directory; see package.json.
 *
 * Configuration is read from _quarto.yml under the "openapi" key:
 *   openapi:
 *     spec: "api/openapi.json"
 *     output: "api/index.qmd"
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { join, dirname, extname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { OpenAPISpec } from "./lib/types.ts";
import { groupByResource, renderApiReferenceBody } from "./lib/sections.ts";

type AnchorStyle = "operation-id" | "path";

interface OpenAPIConfig {
  spec: string;
  output: string;
  "anchor-style"?: AnchorStyle;
}

interface QuartoProject {
  openapi?: OpenAPIConfig;
}

async function main() {
  const projectDir = process.env.QUARTO_PROJECT_DIR;
  if (!projectDir) {
    console.error(
      "QUARTO_PROJECT_DIR not set. This script must run as a Quarto pre-render script.",
    );
    process.exit(1);
  }

  // Read _quarto.yml
  const quartoYmlPath = join(projectDir, "_quarto.yml");
  let quartoYml: QuartoProject;
  try {
    const content = await readFile(quartoYmlPath, "utf8");
    // Quarto 2 config files may tag strings with `!path`; resolve the tag to
    // the plain string instead of warning about it once per occurrence.
    const pathTag = { tag: "!path", resolve: (str: string) => str };
    quartoYml = parseYaml(content, { customTags: [pathTag] }) as QuartoProject;
  } catch (e) {
    console.error(`Failed to read ${quartoYmlPath}: ${e}`);
    process.exit(1);
  }

  const config = quartoYml.openapi;
  if (!config) {
    console.log("No 'openapi' key in _quarto.yml, skipping.");
    return;
  }

  if (!config.spec) {
    console.error("openapi.spec is required in _quarto.yml");
    process.exit(1);
  }
  if (!config.output) {
    console.error("openapi.output is required in _quarto.yml");
    process.exit(1);
  }

  const validAnchorStyles: AnchorStyle[] = ["operation-id", "path"];
  if (config["anchor-style"] && !validAnchorStyles.includes(config["anchor-style"])) {
    console.error(`openapi.anchor-style must be one of: ${validAnchorStyles.join(", ")}`);
    process.exit(1);
  }
  const anchorStyle: AnchorStyle = config["anchor-style"] ?? "operation-id";

  // Load the OpenAPI spec
  const specPath = join(projectDir, config.spec);
  let spec: OpenAPISpec;
  try {
    const content = await readFile(specPath, "utf8");
    const ext = extname(specPath).toLowerCase();
    if (ext === ".json") {
      spec = JSON.parse(content);
    } else {
      spec = parseYaml(content) as OpenAPISpec;
    }
  } catch (e) {
    console.error(`Failed to read spec at ${specPath}: ${e}`);
    process.exit(1);
  }

  // Validate it looks like OpenAPI 3.x
  if (!spec.openapi || !spec.openapi.startsWith("3.")) {
    console.error(
      `Expected OpenAPI 3.x spec, got version: ${spec.openapi || "unknown"}`,
    );
    process.exit(1);
  }

  console.log(`Loaded OpenAPI ${spec.openapi} spec: ${spec.info.title}`);
  console.log(`Paths: ${Object.keys(spec.paths).length}`);
  console.log(
    `Schemas: ${Object.keys(spec.components?.schemas || {}).length}`,
  );

  // Render the body first: it rewrites the spec's descriptions in place,
  // including spec.info.description used below.
  const body = renderApiReferenceBody(spec, anchorStyle);

  const sections = groupByResource(spec);
  console.log(
    `Sections: ${sections.map((s) => `${s.name} (${s.endpoints.length})`).join(", ")}`,
  );

  // Generate single page
  const lines: string[] = [];

  // YAML frontmatter — use a proper serializer to avoid injection via title
  const frontmatter = stringifyYaml({
    title: spec.info.title,
    "page-layout": "full",
    "toc-location": "left",
    toc: true,
    "toc-depth": 3,
    "toc-expand": 1,
  }).trimEnd();
  lines.push("---");
  lines.push(frontmatter);
  lines.push("---");
  lines.push("");

  // Top-level description
  if (spec.info.description) {
    lines.push(spec.info.description);
    lines.push("");
  }

  // Sections
  lines.push(...body);

  const output = lines.join("\n") + "\n";

  // Write output
  const outputPath = join(projectDir, config.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);

  const totalEndpoints = sections.reduce(
    (sum, s) => sum + s.endpoints.length,
    0,
  );
  console.log(
    `Wrote ${outputPath} (${sections.length} sections, ${totalEndpoints} endpoints)`,
  );
}

main();
