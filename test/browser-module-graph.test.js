import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "public");
const libDir = path.join(rootDir, "lib");

// Vite starts from these and follows every static import; anything reachable
// runs in the browser.
const ENTRIES = ["main.jsx", "app.js", "scripture-web-view.js"];

// Packages that only exist on the server. Importing one anywhere in the client
// graph throws while the module initializes, which kills the whole page before
// any listener is wired up.
const NODE_ONLY_PACKAGES = new Set([
  "adm-zip",
  "cfb",
  "express",
  "image-size",
  "multer",
  "pptx-automizer",
  "pptxgenjs",
]);

const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g;
const BARE_IMPORT = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;

function specifiersIn(source) {
  const found = [];
  for (const pattern of [STATIC_IMPORT, BARE_IMPORT]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      found.push(match[1]);
    }
  }
  return found;
}

/** Resolves only what the graph walk can follow; bare packages stay unresolved. */
function resolveSpecifier(specifier, fromFile) {
  if (specifier.startsWith("@lib/")) {
    return path.join(libDir, specifier.slice("@lib/".length));
  }
  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(fromFile), specifier);
  }
  return null;
}

async function collectClientGraph() {
  const queue = ENTRIES.map((entry) => path.join(publicDir, entry));
  const visited = new Set();
  /** @type {{ specifier: string, importer: string }[]} */
  const bareImports = [];

  while (queue.length > 0) {
    const file = queue.pop();
    if (visited.has(file) || !/\.(js|jsx|mjs)$/.test(file)) continue;
    visited.add(file);

    const source = await fs.readFile(file, "utf8");
    for (const specifier of specifiersIn(source)) {
      const resolved = resolveSpecifier(specifier, file);
      if (resolved) {
        queue.push(resolved);
      } else {
        bareImports.push({ specifier, importer: path.relative(rootDir, file) });
      }
    }
  }

  return { files: [...visited], bareImports };
}

test("browser module graph stays free of server-only code", async (t) => {
  const { files, bareImports } = await collectClientGraph();

  await t.test("reaches the shared lib modules it is supposed to", () => {
    const relative = files.map((file) => path.relative(rootDir, file));
    assert.ok(relative.includes("lib/slide-record.js"));
    assert.ok(relative.includes("lib/template-schema.js"));
  });

  await t.test("imports no node: builtins", async () => {
    const offenders = [];
    for (const file of files) {
      const source = await fs.readFile(file, "utf8");
      for (const specifier of specifiersIn(source)) {
        if (specifier.startsWith("node:")) {
          offenders.push(`${path.relative(rootDir, file)} -> ${specifier}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  await t.test("imports no server-only packages", () => {
    const offenders = bareImports
      .filter(({ specifier }) => NODE_ONLY_PACKAGES.has(specifier))
      .map(({ importer, specifier }) => `${importer} -> ${specifier}`);
    assert.deepEqual(offenders, []);
  });
});
