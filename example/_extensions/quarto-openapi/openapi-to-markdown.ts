#!/usr/bin/env -S quarto run

/**
 * Pre-render script for the quarto-openapi extension.
 *
 * Reads an OpenAPI 3.x spec and generates a single .qmd file
 * with the full API reference.
 *
 * Configuration is read from _quarto.yml under the "openapi" key:
 *   openapi:
 *     spec: "api/openapi.json"
 *     output: "api/index.qmd"
 */

import { parse as parseYaml, stringify as stringifyYaml } from "stdlib/yaml";
import { join, dirname, extname } from "stdlib/path";
import type { OpenAPISpec } from "./lib/types.ts";
import { groupByResource, renderSection } from "./lib/sections.ts";

interface OpenAPIConfig {
  spec: string;
  output: string;
}

interface QuartoProject {
  openapi?: OpenAPIConfig;
}

async function main() {
  const projectDir = Deno.env.get("QUARTO_PROJECT_DIR");
  if (!projectDir) {
    console.error(
      "QUARTO_PROJECT_DIR not set. This script must run as a Quarto pre-render script.",
    );
    Deno.exit(1);
  }

  // Read _quarto.yml
  const quartoYmlPath = join(projectDir, "_quarto.yml");
  let quartoYml: QuartoProject;
  try {
    const content = await Deno.readTextFile(quartoYmlPath);
    quartoYml = parseYaml(content) as QuartoProject;
  } catch (e) {
    console.error(`Failed to read ${quartoYmlPath}: ${e}`);
    Deno.exit(1);
  }

  const config = quartoYml.openapi;
  if (!config) {
    console.log("No 'openapi' key in _quarto.yml, skipping.");
    return;
  }

  if (!config.spec) {
    console.error("openapi.spec is required in _quarto.yml");
    Deno.exit(1);
  }
  if (!config.output) {
    console.error("openapi.output is required in _quarto.yml");
    Deno.exit(1);
  }

  // Load the OpenAPI spec
  const specPath = join(projectDir, config.spec);
  let spec: OpenAPISpec;
  try {
    const content = await Deno.readTextFile(specPath);
    const ext = extname(specPath).toLowerCase();
    if (ext === ".json") {
      spec = JSON.parse(content);
    } else {
      spec = parseYaml(content) as OpenAPISpec;
    }
  } catch (e) {
    console.error(`Failed to read spec at ${specPath}: ${e}`);
    Deno.exit(1);
  }

  // Validate it looks like OpenAPI 3.x
  if (!spec.openapi || !spec.openapi.startsWith("3.")) {
    console.error(
      `Expected OpenAPI 3.x spec, got version: ${spec.openapi || "unknown"}`,
    );
    Deno.exit(1);
  }

  console.log(`Loaded OpenAPI ${spec.openapi} spec: ${spec.info.title}`);
  console.log(`Paths: ${Object.keys(spec.paths).length}`);
  console.log(
    `Schemas: ${Object.keys(spec.components?.schemas || {}).length}`,
  );

  // Group endpoints by resource
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
  for (const section of sections) {
    lines.push(...renderSection(spec, section));
  }

  // Write output
  const outputPath = join(projectDir, config.output);
  await Deno.mkdir(dirname(outputPath), { recursive: true });
  await Deno.writeTextFile(outputPath, lines.join("\n") + "\n");

  const totalEndpoints = sections.reduce(
    (sum, s) => sum + s.endpoints.length,
    0,
  );
  console.log(
    `Wrote ${outputPath} (${sections.length} sections, ${totalEndpoints} endpoints)`,
  );
}

main();
