import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import AdmZip from "adm-zip";
import { sampleFirstPixelColorFromBytes } from "pptx-viewer-core";

import { convertLegacyPptToPptx, extractEmbeddedImages } from "../lib/legacy-ppt.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
// One tulip photo fills the master background, so all twelve slides inherit it.
const masterFixture = path.join(fixturesDir, "master-picture-background.ppt");
// Three slides, each carrying its own flat-colour background image.
const perSlideFixture = path.join(fixturesDir, "slide-picture-backgrounds.ppt");
const plainFixture = path.join(fixturesDir, "nhymn25.ppt");

function sha(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function slideParts(zip) {
  return zip
    .getEntries()
    .map((entry) => entry.entryName)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(/(\d+)/.exec(a)[1]) - Number(/(\d+)/.exec(b)[1]));
}

/** The `<p:bg>` of a part, plus the media bytes its blip fill resolves to. */
function background(zip, part) {
  const xml = zip.readAsText(part);
  const bg = /<p:bg>[\s\S]*?<\/p:bg>/.exec(xml)?.[0] ?? null;
  if (!bg) {
    return { bg: null, target: null, bytes: null };
  }
  const embed = /<a:blip[^>]*r:embed="(rId\d+)"/.exec(bg)?.[1];
  if (!embed) {
    return { bg, target: null, bytes: null };
  }
  const rels = zip.readAsText(part.replace(/([^/]+)$/, "_rels/$1.rels"));
  const relative = new RegExp(`Id="${embed}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
  assert.ok(relative, `${part} has no relationship for ${embed}`);
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(part), relative));
  const entry = zip.getEntry(target);
  assert.ok(entry, `${part} background points at missing part ${target}`);
  return { bg, target, bytes: entry.getData() };
}

function declaredExtensions(zip) {
  const xml = zip.readAsText("[Content_Types].xml");
  return [...xml.matchAll(/<Default Extension="([^"]+)"/g)].map((match) => match[1].toLowerCase());
}

describe("picture backgrounds survive .ppt conversion", () => {
  it("moves a master picture background onto the pptx master", async () => {
    const buffer = await fs.readFile(masterFixture);
    // The tulip photo is the first blip; the rest are per-slide score images.
    const expected = extractEmbeddedImages(buffer)[0];
    assert.equal(expected.mime, "image/jpeg");

    const zip = new AdmZip(await convertLegacyPptToPptx(buffer));
    const master = background(zip, "ppt/slideMasters/slideMaster1.xml");

    assert.match(master.bg, /<a:blipFill/);
    assert.equal(sha(master.bytes), sha(expected.buffer));
    assert.ok(declaredExtensions(zip).includes("jpg"));
  });

  it("leaves slides inheriting that master background alone", async () => {
    const zip = new AdmZip(await convertLegacyPptToPptx(await fs.readFile(masterFixture)));

    for (const part of slideParts(zip)) {
      assert.equal(background(zip, part).bg, null, `${part} should inherit the master background`);
    }
  });

  it("keeps each slide's own picture background on that same slide", async () => {
    const buffer = await fs.readFile(perSlideFixture);
    const zip = new AdmZip(await convertLegacyPptToPptx(buffer));
    const parts = slideParts(zip);
    assert.equal(parts.length, 3);

    const seen = new Set();
    for (const part of parts) {
      const { bg, target, bytes } = background(zip, part);
      assert.match(bg ?? "", /<a:blipFill/, `${part} lost its background image`);
      seen.add(target);

      // Each slide is labelled with its own background colour, so the label and
      // the pixel it sits on must agree or the backgrounds got swapped.
      const label = /<a:t>([^<]*)<\/a:t>/.exec(zip.readAsText(part))?.[1];
      const colours = { red: "#dc2828", blue: "#2850dc", green: "#28b45a" };
      assert.equal(await sampleFirstPixelColorFromBytes(new Uint8Array(bytes)), colours[label]);
    }
    assert.equal(seen.size, 3);
  });

  it("still emits a plain background for a deck that never had a picture one", async () => {
    const zip = new AdmZip(await convertLegacyPptToPptx(await fs.readFile(plainFixture)));

    for (const part of ["ppt/slideMasters/slideMaster1.xml", ...slideParts(zip)]) {
      assert.doesNotMatch(background(zip, part).bg ?? "", /<a:blipFill/);
    }
  });
});
