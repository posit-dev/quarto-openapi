/**
 * End-to-end test for the pre-render entry point.
 *
 * The other tests import the rendering library in-process. This one runs
 * `openapi-to-markdown.ts` the way Quarto does — as a Node subprocess with
 * `QUARTO_PROJECT_DIR` set — which is the only way to cover Node executing the
 * TypeScript, resolving the `yaml` bare import from the extension's own
 * node_modules, reading `!path`-tagged config, and writing the output file.
 */

import { test } from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { assert, assertEquals, assertStringIncludes } from "./assert.ts";

const execFileAsync = promisify(execFile);

const SCRIPT = join(
  import.meta.dirname,
  "..",
  "_extensions",
  "quarto-openapi",
  "openapi-to-markdown.ts",
);

const SPEC = {
  openapi: "3.0.3",
  info: {
    title: "Widget API",
    version: "1.0.0",
    description: "Manage widgets.",
  },
  paths: {
    "/v1/widgets/{widget_id}": {
      get: {
        operationId: "getWidget",
        summary: "Get a widget",
        tags: ["Widgets"],
        parameters: [
          {
            name: "widget_id",
            in: "path",
            required: true,
            description: "Identifier of the widget.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "The widget.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Widget" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Widget: {
        type: "object",
        properties: {
          id: { type: "string", description: "Widget identifier." },
        },
      },
    },
  },
};

/**
 * Build a throwaway Quarto project and return its directory. `_quarto.yml` is
 * written by the caller so each test can vary the configuration.
 */
async function project(quartoYml: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "quarto-openapi-"));
  await writeFile(join(dir, "_quarto.yml"), quartoYml);
  await writeFile(join(dir, "openapi.json"), JSON.stringify(SPEC));
  return dir;
}

/** Run the pre-render script against `dir` the way Quarto invokes it. */
function prerender(dir: string) {
  return execFileAsync(process.execPath, [SCRIPT], {
    env: { ...process.env, QUARTO_PROJECT_DIR: dir },
  });
}

test("pre-render script: writes the reference page for a project", async (t) => {
  const dir = await project(
    ["openapi:", '  spec: "openapi.json"', '  output: "api/index.qmd"', ""]
      .join("\n"),
  );
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { stdout } = await prerender(dir);

  assertStringIncludes(stdout, "Loaded OpenAPI 3.0.3 spec: Widget API");
  assertStringIncludes(stdout, "Sections: Widgets (1)");
  assertStringIncludes(stdout, "1 sections, 1 endpoints");

  const page = await readFile(join(dir, "api", "index.qmd"), "utf8");

  assert(page.startsWith("---\n"), "expected YAML frontmatter");
  assertStringIncludes(page, "title: Widget API");
  assertStringIncludes(page, "Manage widgets.");
  assertStringIncludes(page, '{id="getWidget"}');
  assertStringIncludes(page, "widget_id");
  assertStringIncludes(page, "Identifier of the widget.");
  assertStringIncludes(page, "Widget identifier.");
});

test("pre-render script: reads `!path`-tagged config without warning", async (t) => {
  const dir = await project(
    ["openapi:", "  spec: !path openapi.json", "  output: !path api/index.qmd", ""]
      .join("\n"),
  );
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { stderr } = await prerender(dir);

  // The custom `!path` tag is there to stop the YAML parser warning once per
  // occurrence, so an empty stderr is the assertion that matters.
  assertEquals(stderr, "");
  assertStringIncludes(
    await readFile(join(dir, "api", "index.qmd"), "utf8"),
    "title: Widget API",
  );
});

test("pre-render script: skips a project with no openapi key", async (t) => {
  const dir = await project("project:\n  type: website\n");
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { stdout } = await prerender(dir);

  assertStringIncludes(stdout, "No 'openapi' key in _quarto.yml, skipping.");
});

test("pre-render script: fails when QUARTO_PROJECT_DIR is unset", async () => {
  const env = { ...process.env };
  delete env.QUARTO_PROJECT_DIR;

  await assertRejectsWith(
    () => execFileAsync(process.execPath, [SCRIPT], { env }),
    "QUARTO_PROJECT_DIR not set",
  );
});

test("pre-render script: fails on a spec that is not OpenAPI 3.x", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "quarto-openapi-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(
    join(dir, "_quarto.yml"),
    'openapi:\n  spec: "openapi.json"\n  output: "api/index.qmd"\n',
  );
  await mkdir(join(dir, "api"), { recursive: true });
  await writeFile(join(dir, "openapi.json"), JSON.stringify({ swagger: "2.0" }));

  await assertRejectsWith(
    () => prerender(dir),
    "Expected OpenAPI 3.x spec",
  );
});

/** Assert the script exits non-zero and explains itself on stderr. */
async function assertRejectsWith(
  run: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await run();
  } catch (e) {
    const { code, stderr } = e as { code: number; stderr: string };
    assertEquals(code, 1);
    assertStringIncludes(stderr, message);
    return;
  }
  throw new Error(`expected the script to fail with: ${message}`);
}
