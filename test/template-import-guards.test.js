import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { compileAsyncFunction } from "./helpers/app-function.js";

const app = await fs.readFile(
  new URL("../public/app.js", import.meta.url),
  "utf8"
);

function compileImportWithResponse(response) {
  const templates = [];
  const alerts = [];
  let renderCount = 0;
  let toastCount = 0;
  const importTemplateSchemaFile = compileAsyncFunction(
    app,
    "importTemplateSchemaFile",
    ["file"],
    {
      TEMPLATE_SCHEMA_ERROR: { INVALID_JSON: "invalid_json" },
      templateSchemaErrorMessage: () => "템플릿 스키마 파일을 읽을 수 없습니다.",
      parseTemplateSchema: () => ({
        ok: true,
        schema: {
          template: {
            name: "가져온 템플릿",
            slides: [{ name: "슬라이드" }],
          },
        },
        unrestorableNames: [],
      }),
      fetch: async () => response,
      templates,
      cloneTemplate: () => ({ slides: [] }),
      renderTemplateGallery: () => {
        renderCount += 1;
      },
      showToast: () => {
        toastCount += 1;
      },
      formatUnrestorableSchemaMessage: () => "",
      alert: (message) => alerts.push(message),
    }
  );
  return {
    alerts,
    importTemplateSchemaFile,
    renderCount: () => renderCount,
    templates,
    toastCount: () => toastCount,
  };
}

async function runImport(state) {
  await state.importTemplateSchemaFile({
    text: async () => "{}",
  });
}

function assertRejectedBeforeMutation(state) {
  assert.deepEqual(state.alerts, ["템플릿 가져오기에 실패했습니다."]);
  assert.equal(state.templates.length, 0);
  assert.equal(state.renderCount(), 0);
  assert.equal(state.toastCount(), 0);
}

test("successful import rejects non-JSON before cache mutation", async () => {
  const state = compileImportWithResponse({
    ok: true,
    json: async () => {
      throw new SyntaxError("not JSON");
    },
  });

  await runImport(state);
  assertRejectedBeforeMutation(state);
});

test("successful import rejects malformed template payload before cache mutation", async () => {
  const state = compileImportWithResponse({
    ok: true,
    json: async () => ({
      template: { id: "", name: "가져온 템플릿", slides: [] },
    }),
  });

  await runImport(state);
  assertRejectedBeforeMutation(state);
});
