import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { compileAsyncFunction } from "./helpers/app-function.js";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

function createPopup() {
  return {
    closed: false,
    location: "",
    document: {
      write() {},
      close() {},
    },
    close() {
      this.closed = true;
    },
  };
}

describe("scripture web popup", () => {
  it("warns clearly and does not create a session when popup opening is blocked", async () => {
    let fetchCalls = 0;
    const alerts = [];
    const handleOpenWebView = compileAsyncFunction(
      app,
      "handleOpenWebView",
      [],
      {
        window: { open: () => null },
        fetch: async () => {
          fetchCalls += 1;
        },
        buildPptxPayload: async () => ({}),
        alert: (message) => alerts.push(message),
        encodeURIComponent,
      }
    );

    await handleOpenWebView();

    assert.equal(fetchCalls, 0);
    assert.deepEqual(alerts, [
      "팝업이 차단되었습니다. 주소창의 팝업 허용을 켠 뒤 다시 시도하세요.",
    ]);
  });

  it("navigates an opened popup to the created session", async () => {
    const popup = createPopup();
    const handleOpenWebView = compileAsyncFunction(
      app,
      "handleOpenWebView",
      [],
      {
        window: { open: () => popup },
        fetch: async () => ({
          ok: true,
          json: async () => ({ sessionId: "session id/1" }),
        }),
        buildPptxPayload: async () => ({ slides: [] }),
        alert: () => assert.fail("successful opening must not alert"),
        encodeURIComponent,
      }
    );

    await handleOpenWebView();

    assert.equal(
      popup.location,
      "/scripture-web-view.html?session=session%20id%2F1"
    );
    assert.equal(popup.closed, false);
  });

  it("closes an opened popup when payload creation fails", async () => {
    const popup = createPopup();
    let fetchCalls = 0;
    const alerts = [];
    const handleOpenWebView = compileAsyncFunction(
      app,
      "handleOpenWebView",
      [],
      {
        window: { open: () => popup },
        fetch: async () => {
          fetchCalls += 1;
        },
        buildPptxPayload: async () => {
          throw new Error("payload failed");
        },
        alert: (message) => alerts.push(message),
        encodeURIComponent,
      }
    );

    await handleOpenWebView();

    assert.equal(fetchCalls, 0);
    assert.equal(popup.closed, true);
    assert.deepEqual(alerts, ["payload failed"]);
  });

  it("closes an opened popup when session creation fails", async () => {
    const popup = createPopup();
    const alerts = [];
    const handleOpenWebView = compileAsyncFunction(
      app,
      "handleOpenWebView",
      [],
      {
        window: { open: () => popup },
        fetch: async () => ({
          ok: false,
          json: async () => ({ error: "session failed" }),
        }),
        buildPptxPayload: async () => ({ slides: [] }),
        alert: (message) => alerts.push(message),
        encodeURIComponent,
      }
    );

    await handleOpenWebView();

    assert.equal(popup.closed, true);
    assert.deepEqual(alerts, ["session failed"]);
  });
});
