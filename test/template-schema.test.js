import test from "node:test";
import assert from "node:assert/strict";

import {
  TEMPLATE_SCHEMA_KIND,
  TEMPLATE_SCHEMA_VERSION,
  TEMPLATE_SCHEMA_ERROR,
  toPortableTemplateSchema,
  unrestorableSlideNames,
  parseTemplateSchema,
  templateSchemaFilename,
} from "../lib/template-schema.js";
import { sanitizeSlideForTemplate } from "../lib/slide-record.js";

function baseSlide(overrides = {}) {
  return {
    id: "slide-local",
    name: "타이틀",
    type: "title",
    sourceType: "basic",
    content: "본문",
    churchName: "Sydney 삼일교회",
    serviceDate: "2026-09-20",
    titleDesign: "glow",
    serverFilePath: null,
    thumbnail: null,
    originalUrl: null,
    hymnNumber: null,
    adBgSource: "none",
    adBgImagePath: null,
    customImageData: null,
    customSlide: null,
    ...overrides,
  };
}

test("toPortableTemplateSchema writes version 1 and drops local paths", () => {
  const doc = toPortableTemplateSchema({
    id: "template-local",
    name: "주일 예배",
    createdAt: "2026-01-01T00:00:00.000Z",
    slides: [
      baseSlide({
        name: "찬송",
        type: "hymn",
        sourceType: "upload",
        fileName: "nhymn25.ppt",
        fileSaved: true,
        serverFilePath: "/uploads/hymn.ppt",
        thumbnail: "/uploads/hymn.ppt-thumb.jpeg",
        hymnNumber: "25",
        originalUrl: "https://example.test/nhymn25.ppt",
      }),
      baseSlide({
        name: "올린 파일",
        type: "simple",
        sourceType: "upload",
        fileName: "wide.pptx",
        serverFilePath: "/uploads/wide.pptx",
        thumbnail: "/uploads/wide-thumb.jpeg",
      }),
      baseSlide({
        name: "광고",
        type: "ad",
        adBgSource: "file",
        adBgImagePath: "/uploads/bg.png",
        adTitle: "주보",
      }),
    ],
  });

  assert.equal(doc.kind, TEMPLATE_SCHEMA_KIND);
  assert.equal(doc.version, TEMPLATE_SCHEMA_VERSION);
  assert.equal(doc.version, 1);
  assert.match(doc.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(doc.template.name, "주일 예배");
  assert.equal("id" in doc.template, false);
  assert.equal("createdAt" in doc.template, false);

  const [hymn, uploaded, ad] = doc.template.slides;
  assert.equal("id" in hymn, false);
  assert.equal(hymn.serverFilePath, null);
  assert.equal(hymn.thumbnail, null);
  assert.equal(hymn.fileSaved, false);
  assert.equal(hymn.hymnNumber, "25");
  assert.equal(hymn.originalUrl, "https://example.test/nhymn25.ppt");
  assert.equal(hymn.fileName, "nhymn25.ppt");
  assert.equal(uploaded.serverFilePath, null);
  assert.equal(uploaded.unrestorable, true);
  assert.equal(ad.adBgImagePath, null);
  assert.equal(ad.adTitle, "주보");
  assert.equal(ad.unrestorable, true);
});

test("unrestorableSlideNames treats embedded originalUrl as unrestorable", () => {
  const portableShell = toPortableTemplateSchema({
    name: "테스트",
    slides: [baseSlide({ name: "placeholder" })],
  });
  portableShell.template.slides[0] = {
    ...baseSlide({
      name: "로컬 originalUrl",
      type: "hymn",
      sourceType: "upload",
      fileName: "hymn.ppt",
      originalUrl: "/uploads/hymn.ppt",
    }),
  };
  delete portableShell.template.slides[0].id;

  const direct = parseTemplateSchema(JSON.stringify(portableShell));
  assert.equal(direct.ok, true);
  assert.deepEqual(direct.unrestorableNames, ["로컬 originalUrl"]);
  assert.equal(direct.schema.template.slides[0].originalUrl, null);

  const exported = toPortableTemplateSchema({
    name: "테스트",
    slides: [
      baseSlide({
        name: "DATA originalUrl",
        type: "hymn",
        sourceType: "upload",
        fileName: "hymn.ppt",
        originalUrl: "DATA:application/vnd.ms-powerpoint;base64,AAAA",
      }),
    ],
  });
  const roundtrip = parseTemplateSchema(JSON.stringify(exported));
  assert.equal(roundtrip.ok, true);
  assert.deepEqual(roundtrip.unrestorableNames, ["DATA originalUrl"]);
  assert.equal(roundtrip.schema.template.slides[0].originalUrl, null);
});

test("unrestorableSlideNames skips hymns with originalUrl", () => {
  const names = unrestorableSlideNames([
    baseSlide({
      name: "찬송",
      type: "hymn",
      sourceType: "upload",
      fileName: "nhymn25.ppt",
      serverFilePath: "/uploads/hymn.ppt",
      originalUrl: "https://example.test/nhymn25.ppt",
    }),
    baseSlide({
      name: "올린 파일",
      type: "simple",
      sourceType: "upload",
      fileName: "wide.pptx",
      serverFilePath: "/uploads/wide.pptx",
    }),
    baseSlide({
      name: "광고",
      type: "ad",
      adBgSource: "file",
      adBgImagePath: "/uploads/bg.png",
    }),
    baseSlide({
      name: "커스텀",
      type: "custom",
      customSlide: {
        width: 1280,
        height: 720,
        background: "#ffffff",
        elements: [{ id: "img-1", type: "image", src: "/uploads/pic.png" }],
      },
    }),
  ]);

  assert.deepEqual(names, ["올린 파일", "광고", "커스텀"]);
});

test("parseTemplateSchema rejects bad files and newer versions", () => {
  assert.equal(parseTemplateSchema("{").ok, false);
  assert.equal(parseTemplateSchema("{").code, TEMPLATE_SCHEMA_ERROR.INVALID_JSON);

  const valid = toPortableTemplateSchema({
    name: "주일 예배",
    slides: [baseSlide()],
  });

  assert.equal(
    parseTemplateSchema(JSON.stringify({ ...valid, kind: "nope" })).code,
    TEMPLATE_SCHEMA_ERROR.KIND
  );

  const noVersion = { ...valid };
  delete noVersion.version;
  assert.equal(
    parseTemplateSchema(JSON.stringify(noVersion)).code,
    TEMPLATE_SCHEMA_ERROR.VERSION_INVALID
  );

  assert.equal(
    parseTemplateSchema(JSON.stringify({ ...valid, version: 2 })).code,
    TEMPLATE_SCHEMA_ERROR.VERSION_TOO_NEW
  );
  assert.match(
    parseTemplateSchema(JSON.stringify({ ...valid, version: 2 })).message,
    /업데이트/
  );

  assert.equal(
    parseTemplateSchema(JSON.stringify({ ...valid, template: { name: "", slides: [baseSlide()] } })).code,
    TEMPLATE_SCHEMA_ERROR.NAME
  );
  assert.equal(
    parseTemplateSchema(JSON.stringify({ ...valid, template: { name: "A", slides: [] } })).code,
    TEMPLATE_SCHEMA_ERROR.SLIDES
  );
});

test("toPortableSlide strips data URLs and local upload paths from asset fields", () => {
  const dataUrl = "data:image/png;base64,AAAA";
  const doc = toPortableTemplateSchema({
    name: "테스트",
    slides: [
      baseSlide({
        name: "배경 데이터",
        customImageData: dataUrl,
      }),
      baseSlide({
        name: "광고 URL",
        type: "ad",
        adBgSource: "url",
        adBgImageUrl: dataUrl,
      }),
      baseSlide({
        name: "로컬 URL",
        type: "ad",
        adBgSource: "url",
        adBgImageUrl: "/uploads/bg.png",
      }),
      baseSlide({
        name: "광고 HTTPS",
        type: "ad",
        adBgSource: "url",
        adBgImageUrl: "https://example.test/bg.jpg",
      }),
      baseSlide({
        name: "찬송 로컬",
        type: "hymn",
        sourceType: "upload",
        fileName: "hymn.ppt",
        originalUrl: "/uploads/hymn.ppt",
      }),
      baseSlide({
        name: "캔버스",
        type: "custom",
        customSlide: {
          width: 1280,
          height: 720,
          background: "#ffffff",
          elements: [{ id: "1", type: "image", src: dataUrl }],
        },
      }),
    ],
  });

  const slides = doc.template.slides;
  assert.equal(slides[0].customImageData, null);
  assert.equal(slides[1].adBgImageUrl, null);
  assert.equal(slides[2].adBgImageUrl, null);
  assert.equal(slides[3].adBgImageUrl, "https://example.test/bg.jpg");
  assert.equal(slides[4].originalUrl, null);
  assert.equal(slides[5].customSlide.elements[0].src, "");
  assert.equal(slides[0].unrestorable, true);
  assert.equal(slides[1].unrestorable, true);
  assert.equal(slides[2].unrestorable, true);
  assert.equal(slides[4].unrestorable, true);
  assert.equal(slides[5].unrestorable, true);
});

test("unrestorableSlideNames survives export JSON parse roundtrip", () => {
  const template = {
    name: "주일 예배",
    slides: [
      baseSlide({ name: "배경", customImageData: "/uploads/bg.png" }),
      baseSlide({
        name: "광고",
        type: "ad",
        adBgSource: "url",
        adBgImageUrl: "/uploads/ad-bg.png",
      }),
      baseSlide({
        name: "데이터",
        customImageData: "data:image/png;base64,AAAA",
      }),
    ],
  };
  const exported = toPortableTemplateSchema(template);
  const text = JSON.stringify(exported);
  const result = parseTemplateSchema(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.unrestorableNames, ["배경", "광고", "데이터"]);
});

test("unrestorable marker survives POST sanitization and re-export", () => {
  const firstExport = toPortableTemplateSchema({
    name: "주일 예배",
    slides: [
      baseSlide({
        name: "로컬 배경",
        customImageData: "/uploads/bg.png",
      }),
    ],
  });
  const parsed = parseTemplateSchema(JSON.stringify(firstExport));
  assert.equal(parsed.ok, true);

  const persistedSlide = sanitizeSlideForTemplate(
    parsed.schema.template.slides[0]
  );
  assert.equal(persistedSlide.customImageData, null);
  assert.equal(persistedSlide.unrestorable, true);

  const reExported = toPortableTemplateSchema({
    name: parsed.schema.template.name,
    slides: [persistedSlide],
  });
  assert.equal(reExported.template.slides[0].customImageData, null);
  assert.equal(reExported.template.slides[0].unrestorable, true);
  assert.deepEqual(
    unrestorableSlideNames(reExported.template.slides),
    ["로컬 배경"]
  );
});

test("parseTemplateSchema accepts v1 and returns portable slides", () => {
  const text = JSON.stringify(
    toPortableTemplateSchema({
      name: "주일 예배",
      slides: [
        baseSlide({
          serverFilePath: "/uploads/stale.pptx",
          customImageData: "/uploads/bg.png",
        }),
      ],
    })
  );
  const result = parseTemplateSchema(text);
  assert.equal(result.ok, true);
  assert.equal(result.schema.version, 1);
  assert.equal(result.schema.template.slides[0].serverFilePath, null);
  assert.equal(result.schema.template.slides[0].customImageData, null);
  assert.equal(result.schema.template.slides[0].unrestorable, true);
  assert.deepEqual(result.unrestorableNames, ["타이틀"]);
});

test("toPortableSlide strips case-insensitive DATA URLs", () => {
  const doc = toPortableTemplateSchema({
    name: "테스트",
    slides: [
      baseSlide({
        name: "대문자 data",
        customImageData: "DATA:image/png;base64,BBBB",
      }),
    ],
  });
  assert.equal(doc.template.slides[0].customImageData, null);
  assert.equal(doc.template.slides[0].unrestorable, true);
});

test("toPortableSlide keeps canonical customSlide and drops unknown payloads", () => {
  const embedded = "DATA:image/png;base64,CCCC";
  const exported = toPortableTemplateSchema({
    name: "테스트",
    slides: [
      baseSlide({
        name: "커스텀",
        type: "custom",
        customSlide: {
          width: 1280,
          height: 720,
          background: { color: "#ff0000" },
          evilPayload: { nested: true },
          elements: [
            {
              id: "img-1",
              type: "image",
              src: embedded,
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              malicious: "keep-out",
            },
          ],
        },
      }),
    ],
  });

  const slide = exported.template.slides[0];
  assert.equal("evilPayload" in slide.customSlide, false);
  assert.equal(slide.customSlide.background.color, "#ff0000");
  assert.equal("malicious" in slide.customSlide.elements[0], false);
  assert.equal(slide.customSlide.elements[0].src, "");
  assert.equal(slide.unrestorable, true);

  const parsed = parseTemplateSchema(JSON.stringify(exported));
  assert.equal(parsed.ok, true);
  const parsedSlide = parsed.schema.template.slides[0];
  assert.equal("evilPayload" in parsedSlide.customSlide, false);
  assert.equal("malicious" in parsedSlide.customSlide.elements[0], false);
  assert.equal(parsedSlide.customSlide.elements[0].src, "");
  assert.equal(parsedSlide.unrestorable, true);
  assert.notEqual(
    JSON.stringify(parsedSlide.customSlide),
    embedded
  );
  assert.deepEqual(parsed.unrestorableNames, ["커스텀"]);
});

test("unrestorableSlideNames survives export when only serverFilePath exists", () => {
  const template = {
    name: "주일 예배",
    slides: [
      baseSlide({
        name: "경로만",
        type: "simple",
        sourceType: "basic",
        fileName: null,
        serverFilePath: "/uploads/orphan.pptx",
      }),
    ],
  };
  const exported = toPortableTemplateSchema(template);
  assert.equal(exported.template.slides[0].serverFilePath, null);
  assert.equal(exported.template.slides[0].unrestorable, true);
  assert.equal(exported.template.slides[0].fileName, null);

  const result = parseTemplateSchema(JSON.stringify(exported));
  assert.equal(result.ok, true);
  assert.deepEqual(result.unrestorableNames, ["경로만"]);
  assert.equal(result.schema.template.slides[0].serverFilePath, null);
  assert.equal(result.schema.template.slides[0].unrestorable, true);
});

test("templateSchemaFilename sanitizes the name", () => {
  assert.equal(templateSchemaFilename("주일 예배"), "주일 예배.samil-template.json");
  assert.equal(templateSchemaFilename("a/b:c"), "a_b_c.samil-template.json");
});
