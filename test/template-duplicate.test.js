import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

import { duplicateTemplate } from "../lib/template-store.js";
import {
  compileAsyncFunction,
  compileFunction,
  functionBody,
} from "./helpers/app-function.js";

const [app, html, server] = await Promise.all([
  fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  fs.readFile(new URL("../server.js", import.meta.url), "utf8"),
]);

function template(id, name, slides) {
  return {
    id,
    name,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    slideCount: slides.length,
    slides,
  };
}

describe("duplicateTemplate", () => {
  it("inserts a clone after the source with a 복사 name and new ids", () => {
    const sourceSlides = [{ id: "slide-a", name: "광고" }];
    const clonedSlides = [{ id: "slide-copy", name: "광고" }];
    const templates = [
      template("t-keep", "다른 템플릿", []),
      template("t-source", "주일", sourceSlides),
      template("t-after", "다음", []),
    ];

    const result = duplicateTemplate(templates, "t-source", {
      id: "t-clone",
      now: "2026-09-18T00:00:00.000Z",
      slides: clonedSlides,
    });

    assert.equal(result.ok, true);
    assert.equal(result.template.id, "t-clone");
    assert.equal(result.template.name, "주일 복사");
    assert.equal(result.template.createdAt, "2026-09-18T00:00:00.000Z");
    assert.equal(result.template.updatedAt, "2026-09-18T00:00:00.000Z");
    assert.deepEqual(result.template.slides, clonedSlides);
    assert.equal(result.template.slideCount, 1);
    assert.deepEqual(
      result.templates.map((entry) => entry.id),
      ["t-keep", "t-source", "t-clone", "t-after"]
    );
    assert.equal(templates[1].id, "t-source");
    assert.equal(templates[1].slides[0].id, "slide-a");
  });

  it("continues the 복사 sequence when that name is taken", () => {
    const templates = [
      template("t-source", "주일", [{ id: "s1" }]),
      template("t-copy", "주일 복사", [{ id: "s2" }]),
    ];

    const result = duplicateTemplate(templates, "t-source", {
      id: "t-clone",
      now: "2026-09-18T00:00:00.000Z",
      slides: [{ id: "s3" }],
    });

    assert.equal(result.template.name, "주일 복사 2");
  });

  it("reports a missing template instead of inserting one", () => {
    const templates = [template("t-source", "주일", [{ id: "s1" }])];
    const result = duplicateTemplate(templates, "missing", {
      id: "t-clone",
      now: "2026-09-18T00:00:00.000Z",
      slides: [],
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.equal(templates.length, 1);
  });
});

describe("template card duplicate menu", () => {
  it("puts 복제 between rename and schema export", () => {
    const body = functionBody(app, "buildTemplateCard");
    assert.match(body, /buildItem\("복제"\)/);
    assert.match(
      body,
      /appendChild\(renameItem\)[\s\S]*appendChild\(duplicateItem\)[\s\S]*appendChild\(exportItem\)[\s\S]*appendChild\(deleteItem\)/
    );
    assert.match(body, /duplicateTemplateById\(template\.id\)/);
  });

  it("renders the four gallery menu actions in order", () => {
    const { window } = new JSDOM("<!doctype html><body></body>");
    const buildTemplateCard = compileFunction(
      app,
      "buildTemplateCard",
      ["template"],
      {
        document: window.document,
        buildTemplateThumbStrip: () => window.document.createElement("div"),
        formatTemplateGalleryMeta: () => "1장",
        closePopupMenu: () => {},
        openPopupMenu: () => {},
        renameTemplateById: () => {},
        duplicateTemplateById: () => {},
        deleteTemplateById: () => {},
        exportTemplateSchemaById: () => {},
        openTemplateWorkspace: () => {},
      }
    );
    const card = buildTemplateCard({ id: "t1", name: "주일", slides: [] });
    const items = [...card.querySelectorAll(".bulk-dropdown-item")].map(
      (item) => item.textContent
    );
    assert.deepEqual(items, ["이름 변경", "복제", "스키마 내보내기", "삭제"]);
  });
});

describe("duplicateTemplateById", () => {
  it("posts the template id and inserts the clone after the source", async () => {
    const templates = [
      { id: "t-source", name: "주일" },
      { id: "t-after", name: "다음" },
    ];
    const calls = [];
    const toasts = [];
    let rendered = 0;
    const duplicateTemplateById = compileAsyncFunction(
      app,
      "duplicateTemplateById",
      ["templateId"],
      {
        templates,
        blockedBySaveInProgress: () => false,
        fetch: async (url, options) => {
          calls.push({ url, options });
          return {
            ok: true,
            json: async () => ({
              success: true,
              template: { id: "t-clone", name: "주일 복사", slides: [{}] },
            }),
          };
        },
        cloneTemplate: (entry) => ({ ...entry }),
        renderTemplateGallery: () => {
          rendered += 1;
        },
        showToast: (message) => toasts.push(message),
        alert: () => {
          throw new Error("alert should not fire");
        },
      }
    );

    await duplicateTemplateById("t-source");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/templates/t-source/duplicate");
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(
      templates.map((entry) => entry.id),
      ["t-source", "t-clone", "t-after"]
    );
    assert.equal(rendered, 1);
    assert.match(toasts[0], /복제/);
  });

  it("does not post while a save is in progress", async () => {
    let posted = false;
    const duplicateTemplateById = compileAsyncFunction(
      app,
      "duplicateTemplateById",
      ["templateId"],
      {
        templates: [{ id: "t-source", name: "주일" }],
        blockedBySaveInProgress: () => true,
        fetch: async () => {
          posted = true;
          return { ok: true, json: async () => ({}) };
        },
        cloneTemplate: (entry) => entry,
        renderTemplateGallery: () => {},
        showToast: () => {},
        alert: () => {},
      }
    );

    await duplicateTemplateById("t-source");
    assert.equal(posted, false);
  });
});

describe("template duplicate route", () => {
  it("clones slides with assets on POST /api/templates/:id/duplicate", () => {
    const start = server.indexOf('app.post("/api/templates/:id/duplicate"');
    assert.notEqual(start, -1);
    const chunk = server.slice(start, start + 1200);
    assert.match(chunk, /cloneSlideWithAssets/);
    assert.match(chunk, /duplicateTemplate\(/);
  });
});

describe("template workspace menu", () => {
  it("keeps rename on the title and puts clone, export, and delete in ⋯", () => {
    assert.match(html, /id="templateNameDisplay"/);
    assert.match(html, /id="templateWorkspaceMenuBtn"/);
    assert.match(
      html,
      /id="templateDuplicateBtn"[^>]*>\s*복제\s*<\/button>[\s\S]*id="templateSchemaExportBtn"[^>]*>\s*스키마 내보내기\s*<\/button>[\s\S]*id="templateDeleteBtn"[^>]*>\s*삭제\s*<\/button>/
    );
    assert.doesNotMatch(html, /템플릿 삭제/);
  });

  it("wires the workspace items to the same helpers as the gallery", () => {
    assert.match(
      app,
      /templateDuplicateBtn\??\.addEventListener\("click",[\s\S]*?duplicateActiveTemplate/
    );
    assert.match(
      app,
      /templateSchemaExportBtn\??\.addEventListener\("click",[\s\S]*?exportActiveTemplateSchema/
    );
    assert.match(
      app,
      /templateDeleteBtn\.addEventListener\("click",[\s\S]*?deleteActiveTemplate/
    );
  });
});
