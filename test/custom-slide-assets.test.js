import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  cloneCustomSlideAssets,
  collectCustomSlideImageSrcs,
  createCustomSlideRenderOptions,
  customSlideFieldForTemplate,
  inspectImageFile,
  isSupportedCustomImageUpload,
  readImageDimensions,
  resolveUploadsChildPath,
  validateUploadedImageBytes,
} from "../lib/custom-slide-assets.js";
import { createDefaultCustomSlide } from "../public/custom-slide-model.js";

// 2x1 PNG, small enough to inline and dimensioned asymmetrically so a swapped
// width/height would fail the assertion.
const PNG_2x1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

function imageElement(overrides = {}) {
  return {
    id: "image-1",
    type: "image",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    src: "/uploads/photo.png",
    fit: "contain",
    zIndex: 0,
    ...overrides,
  };
}

async function withUploadsDir(run) {
  const uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), "custom-assets-"));
  try {
    return await run(uploadsDir);
  } finally {
    await fs.rm(uploadsDir, { recursive: true, force: true });
  }
}

test("customSlideFieldForTemplate", async (t) => {
  await t.test("returns null for non-custom slides", () => {
    assert.equal(customSlideFieldForTemplate({ type: "simple", customSlide: {} }), null);
    assert.equal(customSlideFieldForTemplate(null), null);
  });

  await t.test("defaults to the canonical empty model", () => {
    assert.deepEqual(
      customSlideFieldForTemplate({ type: "custom" }),
      createDefaultCustomSlide()
    );
  });

  await t.test("normalizes and strips unsupported fields", () => {
    const normalized = customSlideFieldForTemplate({
      type: "custom",
      customSlide: {
        version: 99,
        width: 4000,
        height: 4000,
        rogue: "nope",
        background: { color: "#123456", rogue: "nope" },
        elements: [
          imageElement({ src: "/uploads/../secret.png", rogue: "nope" }),
          { id: "bad", type: "unsupported" },
        ],
      },
    });

    assert.equal(normalized.version, 1);
    assert.equal(normalized.width, 1280);
    assert.equal(normalized.height, 720);
    assert.equal(normalized.rogue, undefined);
    assert.deepEqual(normalized.background, { color: "#123456" });
    assert.equal(normalized.elements.length, 1);
    assert.equal(normalized.elements[0].rogue, undefined);
    // Traversal sources are dropped by the shared model normalizer.
    assert.equal(normalized.elements[0].src, "");
  });

  await t.test("does not share references with its input", () => {
    const customSlide = {
      background: { color: "#ffffff" },
      elements: [imageElement()],
    };
    const normalized = customSlideFieldForTemplate({ type: "custom", customSlide });

    normalized.background.color = "#000000";
    normalized.elements[0].x = 999;

    assert.equal(customSlide.background.color, "#ffffff");
    assert.equal(customSlide.elements[0].x, 10);
  });
});

test("collectCustomSlideImageSrcs", async (t) => {
  await t.test("collects safe upload sources once each", () => {
    const srcs = collectCustomSlideImageSrcs({
      type: "custom",
      customSlide: {
        elements: [
          imageElement({ id: "a", src: "/uploads/one.png" }),
          imageElement({ id: "b", src: "/uploads/one.png" }),
          imageElement({ id: "c", src: "/uploads/two.png" }),
        ],
      },
    });

    assert.deepEqual(srcs, ["/uploads/one.png", "/uploads/two.png"]);
  });

  await t.test("rejects traversal, absolute and remote sources", () => {
    const srcs = collectCustomSlideImageSrcs({
      type: "custom",
      customSlide: {
        elements: [
          imageElement({ id: "a", src: "/uploads/../../etc/passwd" }),
          imageElement({ id: "b", src: "/uploads/%2e%2e/secret.png" }),
          imageElement({ id: "c", src: "https://evil.test/x.png" }),
          imageElement({ id: "d", src: "C:\\Windows\\win.ini" }),
          imageElement({ id: "e", src: "" }),
        ],
      },
    });

    assert.deepEqual(srcs, []);
  });

  await t.test("still finds images when the slide type moved away from custom", () => {
    // Deletion cleanup must not leak pictures just because the user switched
    // the slide back to another type.
    assert.deepEqual(
      collectCustomSlideImageSrcs({
        type: "simple",
        customSlide: { elements: [imageElement({ src: "/uploads/left-behind.png" })] },
      }),
      ["/uploads/left-behind.png"]
    );
  });

  await t.test("keeps refusing unsafe sources regardless of type", () => {
    assert.deepEqual(
      collectCustomSlideImageSrcs({
        type: "simple",
        customSlide: { elements: [imageElement({ src: "/uploads/../secret.png" })] },
      }),
      []
    );
  });

  await t.test("ignores slides without a canvas model", () => {
    assert.deepEqual(collectCustomSlideImageSrcs({ type: "simple" }), []);
    assert.deepEqual(collectCustomSlideImageSrcs(undefined), []);
  });
});

test("cloneCustomSlideAssets", async (t) => {
  await t.test("issues fresh element ids and clones each distinct asset once", async () => {
    const calls = [];
    const cloned = await cloneCustomSlideAssets(
      {
        elements: [
          imageElement({ id: "a", src: "/uploads/one.png" }),
          imageElement({ id: "b", src: "/uploads/one.png", zIndex: 1 }),
          imageElement({ id: "c", src: "/uploads/two.png", zIndex: 2 }),
          { id: "d", type: "rect", x: 0, y: 0, width: 10, height: 10, zIndex: 3 },
        ],
      },
      async (src) => {
        calls.push(src);
        return src.replace("/uploads/", "/uploads/copy-");
      }
    );

    assert.deepEqual(calls, ["/uploads/one.png", "/uploads/two.png"]);
    assert.deepEqual(
      cloned.elements.map((element) => element.src ?? null),
      ["/uploads/copy-one.png", "/uploads/copy-one.png", "/uploads/copy-two.png", null]
    );

    const ids = cloned.elements.map((element) => element.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
      assert.ok(!["a", "b", "c", "d"].includes(id), `expected a fresh id, got ${id}`);
    }
  });

  await t.test("keeps the original source when cloning yields nothing usable", async () => {
    const cloned = await cloneCustomSlideAssets(
      { elements: [imageElement({ src: "/uploads/one.png" })] },
      async () => null
    );

    assert.equal(cloned.elements[0].src, "/uploads/one.png");
  });

  await t.test("never asks to clone unsafe sources", async () => {
    const calls = [];
    const cloned = await cloneCustomSlideAssets(
      { elements: [imageElement({ src: "/uploads/../secret.png" })] },
      async (src) => {
        calls.push(src);
        return src;
      }
    );

    assert.deepEqual(calls, []);
    // The normalizer already blanked the source; the element survives so the
    // renderer can warn about it instead of silently losing layout.
    assert.equal(cloned.elements.length, 1);
    assert.equal(cloned.elements[0].src, "");
  });

  await t.test("returns the canonical empty model for missing input", async () => {
    assert.deepEqual(
      await cloneCustomSlideAssets(null, async (src) => src),
      createDefaultCustomSlide()
    );
  });
});

test("isSupportedCustomImageUpload", async (t) => {
  await t.test("accepts png, jpeg and webp", () => {
    assert.equal(
      isSupportedCustomImageUpload({ mimetype: "image/png", originalname: "a.png" }),
      true
    );
    assert.equal(
      isSupportedCustomImageUpload({ mimetype: "image/jpeg", originalname: "a.JPG" }),
      true
    );
    assert.equal(
      isSupportedCustomImageUpload({ mimetype: "image/webp", originalname: "사진.webp" }),
      true
    );
  });

  await t.test("rejects svg, mismatched extensions and presentations", () => {
    assert.equal(
      isSupportedCustomImageUpload({ mimetype: "image/svg+xml", originalname: "a.svg" }),
      false
    );
    assert.equal(
      isSupportedCustomImageUpload({ mimetype: "image/png", originalname: "a.svg" }),
      false
    );
    assert.equal(
      isSupportedCustomImageUpload({ mimetype: "image/png", originalname: "a.pptx" }),
      false
    );
    assert.equal(
      isSupportedCustomImageUpload({
        mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        originalname: "deck.pptx",
      }),
      false
    );
    assert.equal(isSupportedCustomImageUpload(null), false);
  });
});

test("resolveUploadsChildPath", async (t) => {
  await t.test("resolves uploads-relative paths", () => {
    const uploadsDir = path.join("C:", "app", "uploads");
    assert.equal(
      resolveUploadsChildPath(uploadsDir, "/uploads/photo.png"),
      path.join(uploadsDir, "photo.png")
    );
  });

  await t.test("refuses anything that escapes the uploads directory", () => {
    const uploadsDir = path.join("C:", "app", "uploads");
    assert.equal(resolveUploadsChildPath(uploadsDir, "/uploads/../server.js"), null);
    assert.equal(resolveUploadsChildPath(uploadsDir, "/uploads/a/../../server.js"), null);
    assert.equal(resolveUploadsChildPath(uploadsDir, "/etc/passwd"), null);
    assert.equal(resolveUploadsChildPath(uploadsDir, "/uploads/"), null);
    assert.equal(resolveUploadsChildPath(uploadsDir, ""), null);
    assert.equal(resolveUploadsChildPath(uploadsDir, null), null);
  });
});

test("readImageDimensions", async (t) => {
  await t.test("reads real pixel dimensions", async () => {
    await withUploadsDir(async (uploadsDir) => {
      const filePath = path.join(uploadsDir, "pixel.png");
      await fs.writeFile(filePath, Buffer.from(PNG_2x1_BASE64, "base64"));

      assert.deepEqual(await readImageDimensions(filePath), { width: 2, height: 1 });
    });
  });

  await t.test("returns null instead of throwing for unreadable files", async () => {
    await withUploadsDir(async (uploadsDir) => {
      const filePath = path.join(uploadsDir, "not-an-image.txt");
      await fs.writeFile(filePath, "hello");

      assert.equal(await readImageDimensions(filePath), null);
      assert.equal(await readImageDimensions(path.join(uploadsDir, "missing.png")), null);
    });
  });
});

test("inspectImageFile", async (t) => {
  await t.test("reports the sniffed format alongside the dimensions", async () => {
    await withUploadsDir(async (uploadsDir) => {
      const filePath = path.join(uploadsDir, "pixel.png");
      await fs.writeFile(filePath, Buffer.from(PNG_2x1_BASE64, "base64"));

      assert.deepEqual(await inspectImageFile(filePath), {
        width: 2,
        height: 1,
        type: "png",
      });
    });
  });

  await t.test("returns null for bytes it cannot read", async () => {
    await withUploadsDir(async (uploadsDir) => {
      const filePath = path.join(uploadsDir, "text.png");
      await fs.writeFile(filePath, "definitely not an image");

      assert.equal(await inspectImageFile(filePath), null);
      assert.equal(await inspectImageFile(path.join(uploadsDir, "missing.png")), null);
      assert.equal(await inspectImageFile(null), null);
    });
  });
});

test("validateUploadedImageBytes", async (t) => {
  async function writeUpload(uploadsDir, name, contents, mimetype) {
    const filePath = path.join(uploadsDir, name);
    await fs.writeFile(filePath, contents);
    return { path: filePath, originalname: name, mimetype };
  }

  async function exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  await t.test("accepts real png bytes and keeps the file", async () => {
    await withUploadsDir(async (uploadsDir) => {
      const file = await writeUpload(
        uploadsDir,
        "pixel.png",
        Buffer.from(PNG_2x1_BASE64, "base64"),
        "image/png"
      );

      const result = await validateUploadedImageBytes(file);
      assert.equal(result.valid, true);
      assert.deepEqual(result.dimensions, { width: 2, height: 1 });
      assert.equal(await exists(file.path), true);
    });
  });

  await t.test("deletes bytes that are not an image at all", async () => {
    await withUploadsDir(async (uploadsDir) => {
      const file = await writeUpload(
        uploadsDir,
        "fake.png",
        "<html>gotcha</html>",
        "image/png"
      );

      const result = await validateUploadedImageBytes(file);
      assert.equal(result.valid, false);
      assert.match(result.error, /이미지/);
      assert.equal(await exists(file.path), false);
    });
  });

  await t.test("deletes svg bytes disguised as a png", async () => {
    await withUploadsDir(async (uploadsDir) => {
      const file = await writeUpload(
        uploadsDir,
        "vector.png",
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
        "image/png"
      );

      assert.equal((await validateUploadedImageBytes(file)).valid, false);
      assert.equal(await exists(file.path), false);
    });
  });

  await t.test("deletes png bytes declared as jpeg", async () => {
    await withUploadsDir(async (uploadsDir) => {
      const file = await writeUpload(
        uploadsDir,
        "mislabeled.jpg",
        Buffer.from(PNG_2x1_BASE64, "base64"),
        "image/jpeg"
      );

      const result = await validateUploadedImageBytes(file);
      assert.equal(result.valid, false);
      assert.equal(await exists(file.path), false);
    });
  });

  await t.test("rejects a missing file without throwing", async () => {
    await withUploadsDir(async (uploadsDir) => {
      const result = await validateUploadedImageBytes({
        path: path.join(uploadsDir, "gone.png"),
        originalname: "gone.png",
        mimetype: "image/png",
      });
      assert.equal(result.valid, false);
      assert.equal((await validateUploadedImageBytes(null)).valid, false);
    });
  });
});

test("createCustomSlideRenderOptions", async (t) => {
  await t.test("resolves uploads images and measures them", async () => {
    await withUploadsDir(async (uploadsDir) => {
      await fs.writeFile(
        path.join(uploadsDir, "pixel.png"),
        Buffer.from(PNG_2x1_BASE64, "base64")
      );
      const warnings = [];
      const options = createCustomSlideRenderOptions({
        uploadsDir,
        onWarning: (message) => warnings.push(message),
      });

      const resolved = await options.resolveImagePath("/uploads/pixel.png");
      assert.equal(resolved, path.join(uploadsDir, "pixel.png"));
      assert.deepEqual(await options.getImageDimensions(resolved), { width: 2, height: 1 });
      assert.deepEqual(warnings, []);
    });
  });

  await t.test("throws for sources outside uploads so the renderer only warns", async () => {
    await withUploadsDir(async (uploadsDir) => {
      const options = createCustomSlideRenderOptions({ uploadsDir });
      await assert.rejects(
        async () => options.resolveImagePath("/uploads/../server.js"),
        /이미지/
      );
    });
  });

  await t.test("renders a custom slide without failing on a broken image", async () => {
    await withUploadsDir(async (uploadsDir) => {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const { appendCustomSlide } = await import("../lib/custom-slide-pptx.js");
      await fs.writeFile(
        path.join(uploadsDir, "pixel.png"),
        Buffer.from(PNG_2x1_BASE64, "base64")
      );

      const warnings = [];
      const pptx = new PptxGenJS();
      await appendCustomSlide(
        pptx,
        {
          customSlide: {
            elements: [
              imageElement({ id: "good", src: "/uploads/pixel.png" }),
              imageElement({ id: "missing", src: "/uploads/gone.png", zIndex: 1 }),
              {
                id: "text",
                type: "text",
                text: "still here",
                x: 0,
                y: 0,
                width: 200,
                height: 50,
                zIndex: 2,
              },
            ],
          },
        },
        createCustomSlideRenderOptions({
          uploadsDir,
          onWarning: (message) => warnings.push(message),
        })
      );

      const buffer = await pptx.write({ outputType: "nodebuffer" });
      assert.ok(buffer.length > 0);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /gone\.png/);
    });
  });
});
