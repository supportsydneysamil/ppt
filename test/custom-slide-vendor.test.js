import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8"));
}

test("the declared fabric dependency is the one that is installed", async () => {
  const appPackage = await readJson("../package.json");
  const fabricPackage = await readJson("../node_modules/fabric/package.json");
  assert.equal(fabricPackage.name, "fabric");
  assert.ok(appPackage.dependencies?.fabric);
  assert.equal(fabricPackage.version.split(".")[0], appPackage.dependencies.fabric.replace(/^[^\d]*/, "").split(".")[0]);
});

test("the editor loads fabric from the npm package unless a test URL is injected", async () => {
  const source = await readFile(new URL("../public/custom-slide-editor.js", import.meta.url), "utf8");
  assert.match(source, /await import\("fabric"\)/);
  assert.doesNotMatch(source, /\/vendor\/fabric/);
});

test("vite config and production start exist", async () => {
  const appPackage = await readJson("../package.json");
  assert.equal(appPackage.scripts.build, "vite build");
  assert.match(appPackage.scripts.start, /NODE_ENV=production/);
  const server = await readFile(new URL("../server.js", import.meta.url), "utf8");
  assert.match(server, /ENABLE_VITE/);
  assert.match(server, /distDir/);
});
