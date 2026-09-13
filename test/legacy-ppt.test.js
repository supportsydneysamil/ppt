import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { countPptSlides, extractEmbeddedImages } from "../lib/legacy-ppt.js";

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "nhymn25.ppt"
);

describe("extractEmbeddedImages", () => {
  it("pulls one 1152x648 PNG per hymn slide", async () => {
    const buffer = await fs.readFile(fixturePath);
    const images = extractEmbeddedImages(buffer);
    const slides = countPptSlides(buffer);

    assert.equal(images.length, slides);
    assert.ok(images.length > 0);
    for (const image of images) {
      assert.equal(image.mime, "image/png");
      assert.equal(image.buffer[0], 0x89);
      assert.equal(image.buffer.toString("ascii", 1, 4), "PNG");
      assert.equal(image.width, 1152);
      assert.equal(image.height, 648);
    }
  });
});
