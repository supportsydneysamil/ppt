import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import AdmZip from "adm-zip";
import PptxGenJS from "pptxgenjs";

import {
  appendCustomTitleCatalogSlide,
  appendCustomTitleSlide,
  CUSTOM_TITLE_DESIGNS,
} from "../lib/custom-title-slide.js";
import {
  CUSTOM_TITLE_DESIGN_CATALOG,
  CUSTOM_TITLE_DESIGN_IDS,
  CUSTOM_TITLE_LAYOUT_FAMILIES,
  findCustomTitleDesign,
} from "../lib/custom-title-design-catalog.js";
import * as customTitleText from "../lib/custom-title-text.js";
import { decodePng, pixelAt } from "./helpers/png-decode.js";

async function renderArchive(slide) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  appendCustomTitleSlide(pptx, slide);
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  const zip = new AdmZip(buffer);
  return {
    zip,
    slideXml: zip.readAsText("ppt/slides/slide1.xml"),
  };
}

async function render(slide) {
  return (await renderArchive(slide)).slideXml;
}

/** Renders a catalog design object straight through the family renderer. */
async function renderCatalogArchive(design, content) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  appendCustomTitleCatalogSlide(pptx, design, content);
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  const zip = new AdmZip(buffer);
  return { zip, slideXml: zip.readAsText("ppt/slides/slide1.xml") };
}

async function renderCatalog(design, content = { ko: "성찬 예배" }) {
  return (await renderCatalogArchive(design, content)).slideXml;
}

/** A neutral theme so probe renders differ only by family and mood. */
function probeTheme(overrides) {
  return {
    mood: "dark",
    titleFont: "sans",
    background: "102030",
    backgroundAccent: "405060",
    title: "FFFFFF",
    accent: "C0D0E0",
    rule: "8090A0",
    muted: "708090",
    subtitleText: "F0F0F0",
    haloColor: "C0D0E0",
    haloOpacity: 0.15,
    ...overrides,
  };
}

function probeDesign(overrides) {
  return {
    id: "probe",
    categoryId: "premium",
    name: "프로브",
    description: "테스트용 디자인",
    layoutFamily: "centered-rule",
    theme: probeTheme(),
    ...overrides,
  };
}

/** Rules and dividers are the only line-geometry shapes these slides draw. */
function dividerCount(slideXml) {
  return (slideXml.match(/prstGeom prst="line"/g) || []).length;
}

function parse(slideXml) {
  return new DOMParser().parseFromString(slideXml, "text/xml");
}

function shapeByName(slideXml, name) {
  return Array.from(parse(slideXml).getElementsByTagName("p:sp")).find(
    (shape) =>
      shape.getElementsByTagName("p:cNvPr")[0]?.getAttribute("name") === name
  );
}

function pictureByName(slideXml, name) {
  return Array.from(parse(slideXml).getElementsByTagName("p:pic")).find(
    (picture) =>
      picture.getElementsByTagName("p:cNvPr")[0]?.getAttribute("name") === name
  );
}

/** The drawn element carrying `name`, whatever kind of shape it is. */
function elementByName(slideXml, name) {
  const document = parse(slideXml);
  for (const tag of ["p:sp", "p:cxnSp", "p:pic"]) {
    const node = Array.from(document.getElementsByTagName(tag)).find(
      (candidate) =>
        candidate.getElementsByTagName("p:cNvPr")[0]?.getAttribute("name") ===
        name
    );
    if (node) {
      return { tag, node };
    }
  }
  return null;
}

function inches(value) {
  return Number((Number(value) / 914400).toFixed(2));
}

function geometry({ tag, node }) {
  const transform = node.getElementsByTagName("a:xfrm")[0];
  const offset = transform.getElementsByTagName("a:off")[0];
  const extent = transform.getElementsByTagName("a:ext")[0];
  return {
    tag,
    prst: node.getElementsByTagName("a:prstGeom")[0]?.getAttribute("prst"),
    x: inches(offset.getAttribute("x")),
    y: inches(offset.getAttribute("y")),
    w: inches(extent.getAttribute("cx")),
    h: inches(extent.getAttribute("cy")),
  };
}

/** Every decoration the family renderer drew, in document order. */
function decorations(slideXml) {
  const document = parse(slideXml);
  return Array.from(document.getElementsByTagName("p:cNvPr"))
    .map((node) => node.getAttribute("name"))
    .filter(
      (name) =>
        name?.startsWith("custom-title:") &&
        !name.startsWith("custom-title:title-") &&
        !name.startsWith("custom-title:subtitle-") &&
        !name.startsWith("custom-title:background-")
    );
}

function shapeWithText(slideXml, text) {
  return Array.from(parse(slideXml).getElementsByTagName("p:sp")).find(
    (shape) =>
      Array.from(shape.getElementsByTagName("a:t")).some(
        (node) => node.textContent === text
      )
  );
}

function textMetrics(shape) {
  const transform = shape.getElementsByTagName("a:xfrm")[0];
  const offset = transform.getElementsByTagName("a:off")[0];
  const extent = transform.getElementsByTagName("a:ext")[0];
  const run = shape.getElementsByTagName("a:rPr")[0];
  return {
    x: Number((Number(offset.getAttribute("x")) / 914400).toFixed(2)),
    y: Number((Number(offset.getAttribute("y")) / 914400).toFixed(2)),
    w: Number((Number(extent.getAttribute("cx")) / 914400).toFixed(2)),
    h: Number((Number(extent.getAttribute("cy")) / 914400).toFixed(2)),
    fontSize: run ? Number(run.getAttribute("sz")) / 100 : 0,
  };
}

/** The decoded picture a named picture shape actually points at. */
function rasterByName(zip, slideXml, name) {
  const picture = pictureByName(slideXml, name);
  assert.ok(picture, `${name} picture must exist`);
  const embed = picture
    .getElementsByTagName("a:blip")[0]
    .getAttribute("r:embed");
  const rels = zip.readAsText("ppt/slides/_rels/slide1.xml.rels");
  const target = new RegExp(`Id="${embed}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
  assert.ok(target, `${name} relationship ${embed} must resolve`);
  return decodePng(zip.getEntry(`ppt/${target.replace(/^\.\.\//, "")}`).getData());
}

function haloRaster(zip, slideXml) {
  return rasterByName(zip, slideXml, "custom-title:subtitle-halo");
}

/** A coarse pixel fingerprint, enough to tell two compositions apart. */
function rasterSignature(raster) {
  const samples = [];
  for (let row = 1; row <= 7; row += 1) {
    for (let column = 1; column <= 7; column += 1) {
      const x = Math.round((raster.width * column) / 8);
      const y = Math.round((raster.height * row) / 8);
      samples.push(pixelAt(raster, x, y).join("."));
    }
  }
  return samples.join("|");
}

const ORIGINAL_DESIGN_IDS = ["aurora", "monolith", "ivory", "marquee"];

// The shape each family's primary decoration must be, so a matching object
// name alone cannot hide a design dispatched to the wrong drawing path.
const FAMILY_MARKERS = {
  "centered-rule": {
    tag: "p:sp",
    prst: "line",
    x: 0.65,
    y: 0.65,
    w: 12.03,
    h: 0,
  },
  "double-frame": {
    tag: "p:sp",
    prst: "rect",
    x: 0.42,
    y: 0.42,
    w: 12.49,
    h: 6.66,
  },
  "ornament-frame": {
    tag: "p:sp",
    prst: "rect",
    x: 0.46,
    y: 0.46,
    w: 12.41,
    h: 6.58,
  },
  "side-band": { tag: "p:sp", prst: "rect", x: 0, y: 0, w: 0.34, h: 7.5 },
  "horizon-split": {
    tag: "p:sp",
    prst: "rect",
    x: 0,
    y: 4.72,
    w: 13.33,
    h: 2.78,
  },
  "emblem-crest": {
    tag: "p:sp",
    prst: "ellipse",
    x: 6.33,
    y: 1.05,
    w: 0.68,
    h: 0.68,
  },
  "veil-panel": {
    tag: "p:sp",
    prst: "rect",
    x: 5.82,
    y: 0.68,
    w: 6.72,
    h: 6.14,
  },
  "corner-mark": {
    tag: "p:sp",
    prst: "line",
    x: 0.78,
    y: 0.78,
    w: 1.05,
    h: 0,
  },
};

function rgb(hex) {
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

describe("subtitleFontSize", () => {
  it("uses exact non-space character thresholds", () => {
    assert.equal(typeof customTitleText.subtitleFontSize, "function");
    assert.equal(customTitleText.subtitleFontSize("1234567890123456"), 28);
    assert.equal(customTitleText.subtitleFontSize("12345678901234567"), 24);
    assert.equal(customTitleText.subtitleFontSize("123456789012345678901234"), 24);
    assert.equal(customTitleText.subtitleFontSize("1234567890123456789012345"), 22);
    assert.equal(customTitleText.subtitleFontSize("1234 5678 9012 3456"), 28);
  });
});

describe("appendCustomTitleSlide", () => {
  it("exports all 31 catalog designs in catalog order", () => {
    assert.deepEqual(CUSTOM_TITLE_DESIGNS, CUSTOM_TITLE_DESIGN_IDS);
  });

  it("renders every design as a valid one-slide deck with all supplied text", async () => {
    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const { zip, slideXml } = await renderArchive({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
        customTitleSubtitle: "한 몸을 이루는 교회",
      });

      assert.ok(zip.getEntry("ppt/slides/slide1.xml"));
      assert.equal(zip.getEntry("ppt/slides/slide2.xml"), null);
      assert.match(slideXml, /<a:t>성찬 예배<\/a:t>/);
      assert.match(slideXml, /<a:t>HOLY COMMUNION<\/a:t>/);
      assert.match(slideXml, /<a:t>한 몸을 이루는 교회<\/a:t>/);
    }
  });

  it("dispatches every design through its declared layout family", async () => {
    for (const design of CUSTOM_TITLE_DESIGN_CATALOG) {
      const slideXml = await render({
        customTitleDesign: design.id,
        customTitleKo: "성찬 예배",
      });
      const marker = elementByName(
        slideXml,
        `custom-title:family:${design.layoutFamily}`
      );
      assert.ok(marker, `${design.id} must use ${design.layoutFamily}`);

      // The original four keep their own hand-tuned compositions, so only the
      // catalog-driven designs answer to the shared family geometry.
      if (ORIGINAL_DESIGN_IDS.includes(design.id)) {
        continue;
      }
      assert.deepEqual(
        geometry(marker),
        FAMILY_MARKERS[design.layoutFamily],
        `${design.id} must draw the ${design.layoutFamily} marker shape`
      );
    }
  });

  it("paints a different gradient for every family and mood", async () => {
    const seen = new Map();

    for (const layoutFamily of CUSTOM_TITLE_LAYOUT_FAMILIES) {
      for (const mood of ["dark", "light"]) {
        const label = `${layoutFamily}/${mood}`;
        const { zip, slideXml } = await renderCatalogArchive(
          probeDesign({ layoutFamily, theme: probeTheme({ mood }) }),
          { ko: "성찬 예배" }
        );
        const signature = rasterSignature(
          rasterByName(zip, slideXml, "custom-title:background-gradient")
        );

        assert.equal(
          seen.get(signature),
          undefined,
          `${label} must not reuse ${seen.get(signature)}'s gradient`
        );
        seen.set(signature, label);
      }
    }

    assert.equal(seen.size, CUSTOM_TITLE_LAYOUT_FAMILIES.length * 2);
  });

  it("composes a distinct multi-part decoration for every family", async () => {
    const seen = new Map();

    for (const layoutFamily of CUSTOM_TITLE_LAYOUT_FAMILIES) {
      const slideXml = await renderCatalog(probeDesign({ layoutFamily }));
      const names = decorations(slideXml);

      assert.ok(
        names.length >= 3,
        `${layoutFamily} needs a composed motif, drew ${names.length} shapes`
      );
      assert.equal(
        new Set(names).size,
        names.length,
        `${layoutFamily} decoration names must be unique`
      );

      const signature = names.join("|");
      assert.equal(
        seen.get(signature),
        undefined,
        `${layoutFamily} must not reuse ${seen.get(signature)}'s decoration set`
      );
      seen.set(signature, layoutFamily);
    }
  });

  it("keeps small decorative motifs clear of the title-safe centre", async () => {
    // Anything this small is an accent rather than a backing panel, so it must
    // never land where the Korean headline and its English line sit.
    const SAFE = { left: 1.35, right: 11.98, top: 2.45, bottom: 5.75 };

    for (const layoutFamily of CUSTOM_TITLE_LAYOUT_FAMILIES) {
      const slideXml = await renderCatalog(probeDesign({ layoutFamily }));

      for (const name of decorations(slideXml)) {
        const box = geometry(elementByName(slideXml, name));
        if (Math.max(box.w, box.h) > 3) {
          continue;
        }
        const overlaps =
          box.x < SAFE.right &&
          box.x + box.w > SAFE.left &&
          box.y < SAFE.bottom &&
          box.y + box.h > SAFE.top;
        assert.equal(
          overlaps,
          false,
          `${layoutFamily} motif ${name} must not cover the title`
        );
      }
    }
  });

  it("refuses to render a design whose layout family has no drawing path", () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";

    assert.throws(
      () =>
        appendCustomTitleCatalogSlide(
          pptx,
          probeDesign({ layoutFamily: "no-such-family" }),
          { ko: "성찬 예배", en: "", subtitle: "" }
        ),
      /no-such-family/,
      "an unknown family must fail loudly instead of drawing a fallback"
    );
  });

  it("refuses to embed an asset path that escapes the asset folder", () => {
    for (const path of [
      "assets/custom-title/../../server.js",
      "/etc/hosts",
      "https://example.com/star.png",
      "assets/other/star.png",
    ]) {
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";

      assert.throws(
        () =>
          appendCustomTitleCatalogSlide(
            pptx,
            probeDesign({ asset: { path, width: 1280, height: 720 } }),
            { ko: "성찬 예배", en: "", subtitle: "" }
          ),
        /asset path/,
        `${path} must never reach the renderer`
      );
    }
  });

  it("embeds only declared local image backgrounds with resolvable media", async () => {
    for (const design of CUSTOM_TITLE_DESIGN_CATALOG) {
      const { zip, slideXml } = await renderArchive({
        customTitleDesign: design.id,
        customTitleKo: "성찬 예배",
      });
      const background = pictureByName(
        slideXml,
        "custom-title:background-asset"
      );

      if (!design.asset) {
        assert.equal(
          background,
          undefined,
          `${design.id} must not depend on a catalog image`
        );
        continue;
      }

      assert.ok(background, `${design.id} must embed its local image`);
      const embed = background
        .getElementsByTagName("a:blip")[0]
        .getAttribute("r:embed");
      const rels = zip.readAsText("ppt/slides/_rels/slide1.xml.rels");
      const target = new RegExp(
        `Id="${embed}"[^>]*Target="([^"]+)"`
      ).exec(rels)?.[1];
      assert.ok(target, `${design.id} image relationship must resolve`);
      assert.ok(
        zip.getEntry(`ppt/${target.replace(/^\.\.\//, "")}`),
        `${design.id} image media must exist`
      );
    }
  });

  it("bleeds each local image to the slide edges under a readability overlay", async () => {
    const FULL_BLEED = { x: 0, y: 0, w: 13.33, h: 7.5 };

    for (const design of CUSTOM_TITLE_DESIGN_CATALOG.filter((d) => d.asset)) {
      const slideXml = await render({
        customTitleDesign: design.id,
        customTitleKo: "성찬 예배",
      });

      const image = elementByName(slideXml, "custom-title:background-asset");
      assert.ok(image, `${design.id} must embed its image`);
      assert.deepEqual(
        { x: 0, y: 0, w: geometry(image).w, h: geometry(image).h },
        FULL_BLEED,
        `${design.id} image must cover the whole slide`
      );

      const overlay = elementByName(
        slideXml,
        "custom-title:background-overlay"
      );
      assert.ok(overlay, `${design.id} needs a readability overlay`);
      assert.deepEqual(geometry(overlay), {
        tag: "p:sp",
        prst: "rect",
        ...FULL_BLEED,
      });
      assert.match(
        slideXml,
        /<a:alpha val="[1-9]\d{0,5}"\/>/,
        `${design.id} overlay must be translucent, not solid`
      );
    }
  });

  it("renders one theme-tinted lower halo and shifts the title stack", async () => {
    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const { theme } = findCustomTitleDesign(customTitleDesign);
      const baselineXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
      });
      const { zip, slideXml } = await renderArchive({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
        customTitleSubtitle: "한 몸을 이루는 교회",
      });

      const halo = pictureByName(slideXml, "custom-title:subtitle-halo");
      const subtitle = shapeByName(slideXml, "custom-title:subtitle-text");
      assert.ok(halo, `${customTitleDesign} halo image must exist`);
      assert.deepEqual(textMetrics(halo), {
        x: 1.07,
        y: 6.1,
        w: 11.19,
        h: 0.85,
        fontSize: 0,
      });
      assert.ok(subtitle, `${customTitleDesign} subtitle text must exist`);
      assert.deepEqual(textMetrics(subtitle), {
        x: 1.07,
        y: 6.1,
        w: 11.19,
        h: 0.85,
        fontSize: 28,
      });

      const baselineKo = textMetrics(shapeWithText(baselineXml, "성찬 예배"));
      const subtitleKo = textMetrics(shapeWithText(slideXml, "성찬 예배"));
      assert.equal(
        Number((subtitleKo.y - baselineKo.y).toFixed(2)),
        -0.45,
        `${customTitleDesign} title stack must move up`
      );

      // The glow is brightest dead centre and has faded out entirely by the
      // corners, which sit outside the gradient's radius.
      const raster = haloRaster(zip, slideXml);
      const centre = pixelAt(raster, raster.width >> 1, raster.height >> 1);
      assert.deepEqual(
        centre.slice(0, 3),
        rgb(theme.haloColor),
        `${customTitleDesign} halo must be tinted with its theme colour`
      );
      assert.equal(
        centre[3],
        Math.round(theme.haloOpacity * 255),
        `${customTitleDesign} halo must use its theme opacity`
      );
      assert.equal(pixelAt(raster, 0, 0)[3], 0);
      assert.doesNotMatch(
        slideXml,
        /custom-title:subtitle-(panel|accent|dot|diamond)/
      );
    }
  });

  it("renders a subtitle without adding an English divider when English is empty", async () => {
    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const baselineXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
      });
      const subtitleXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleSubtitle: "한 몸을 이루는 교회",
      });

      assert.match(subtitleXml, /<a:t>한 몸을 이루는 교회<\/a:t>/);
      assert.equal(
        dividerCount(subtitleXml),
        dividerCount(baselineXml),
        `${customTitleDesign} must not add a divider without an English title`
      );
    }
  });

  it("preserves the original title position and omits the panel for an empty subtitle", async () => {
    for (const customTitleDesign of CUSTOM_TITLE_DESIGNS) {
      const baselineXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
      });
      const emptySubtitleXml = await render({
        customTitleDesign,
        customTitleKo: "성찬 예배",
        customTitleEn: "Holy Communion",
        customTitleSubtitle: "",
      });

      assert.deepEqual(
        textMetrics(shapeWithText(emptySubtitleXml, "성찬 예배")),
        textMetrics(shapeWithText(baselineXml, "성찬 예배"))
      );
      assert.equal(
        pictureByName(emptySubtitleXml, "custom-title:subtitle-halo"),
        undefined
      );
      assert.equal(
        shapeByName(emptySubtitleXml, "custom-title:subtitle-text"),
        undefined
      );
    }
  });
});
