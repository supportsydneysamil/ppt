import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

import { FABRIC_MODULE_URL } from "../public/custom-slide-editor.js";

const VENDOR_PREFIX = "/vendor/fabric/";

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8"));
}

function caretRange(range) {
  const match = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(String(range ?? ""));
  assert.ok(match, `fabric must be pinned with a caret range, got ${range}`);
  return match.slice(1).map(Number);
}

function version(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value ?? ""));
  assert.ok(match, `unreadable fabric version ${value}`);
  return match.slice(1).map(Number);
}

test("the declared fabric dependency is the one that is installed", async () => {
  const appPackage = await readJson("../package.json");
  const fabricPackage = await readJson("../node_modules/fabric/package.json");

  const [wantedMajor, wantedMinor, wantedPatch] = caretRange(
    appPackage.dependencies?.fabric
  );
  const [major, minor, patch] = version(fabricPackage.version);

  assert.equal(fabricPackage.name, "fabric");
  assert.equal(major, wantedMajor, "installed fabric major must match package.json");
  assert.ok(
    minor > wantedMinor || (minor === wantedMinor && patch >= wantedPatch),
    `installed fabric ${fabricPackage.version} is older than ${appPackage.dependencies.fabric}`
  );
});

test("the editor module URL resolves to a distribution the package ships", async () => {
  assert.ok(
    FABRIC_MODULE_URL.startsWith(VENDOR_PREFIX),
    `unexpected fabric module URL ${FABRIC_MODULE_URL}`
  );

  const distFile = FABRIC_MODULE_URL.slice(VENDOR_PREFIX.length);
  await access(new URL(`../node_modules/fabric/dist/${distFile}`, import.meta.url));

  const fabricPackage = await readJson("../node_modules/fabric/package.json");
  assert.equal(
    fabricPackage.exports?.["."]?.import,
    `./dist/${distFile}`,
    "the browser must load the same ESM build npm resolves"
  );
});

test("the server mounts the vendor prefix on the fabric distribution", async () => {
  const server = await readFile(new URL("../server.js", import.meta.url), "utf8");
  const mount = VENDOR_PREFIX.replace(/\/$/, "");

  assert.match(server, new RegExp(`['"]${mount}['"]`), `server must mount ${mount}`);
  assert.match(
    server,
    /express\.static\(\s*path\.join\(__dirname,\s*"node_modules",\s*"fabric",\s*"dist"\)\s*\)/,
    "the vendor mount must serve node_modules/fabric/dist"
  );
});
