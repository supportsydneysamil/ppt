import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";

const HTML = readFileSync(
  new URL("../public/scripture-web-view.html", import.meta.url),
  "utf8",
);

let createScriptureWebView;
let bootstrapDom;
const previousDocument = globalThis.document;
const previousWindow = globalThis.window;

before(async () => {
  bootstrapDom = new JSDOM(HTML, {
    url: "https://example.test/scripture-web-view.html",
  });
  globalThis.document = bootstrapDom.window.document;
  globalThis.window = bootstrapDom.window;
  ({ createScriptureWebView } = await import(
    `../public/scripture-web-view.js?test=${Date.now()}`
  ));
});

after(() => {
  globalThis.document = previousDocument;
  globalThis.window = previousWindow;
  bootstrapDom.window.close();
});

function payload() {
  return {
    title: "테스트 성경",
    slideCount: 2,
    theme: {
      bgColor: "112233",
      textColor: "ffffff",
      labelColor: "eeeeee",
    },
    slides: [
      {
        kind: "single",
        labelText: "창 1:1",
        text: "첫 슬라이드",
        lang: "ko",
        fontSize: 30,
      },
      {
        kind: "single",
        labelText: "창 1:2",
        text: "마지막 슬라이드",
        lang: "ko",
        fontSize: 30,
      },
    ],
  };
}

function fixture({
  response,
  url = "https://example.test/scripture-web-view.html?session=abc",
} = {}) {
  const dom = new JSDOM(HTML, { url });
  const { document } = dom.window;
  let viewportWidth = 1333;
  let viewportHeight = 750;
  document.getElementById("stageViewport").getBoundingClientRect = () => ({
    width: viewportWidth,
    height: viewportHeight,
    left: 0,
    top: 0,
    right: viewportWidth,
    bottom: viewportHeight,
  });
  let presenterOptions;
  let autoFullscreenCalls = 0;
  const createPresenter = (options) => {
    presenterOptions = options;
    return {
      async attemptAutoFullscreen() {
        autoFullscreenCalls += 1;
        assert.ok(
          document.querySelector(".slide-frame"),
          "auto fullscreen must run after the first slide renders",
        );
        assert.equal(
          document.getElementById("stageCanvas").style.transform,
          "scale(1)",
        );
      },
    };
  };
  let closeCalls = 0;
  dom.window.close = () => {
    closeCalls += 1;
  };
  const view = createScriptureWebView({
    document,
    window: dom.window,
    fetch: async () =>
      response || {
        ok: true,
        json: async () => payload(),
      },
    createPresenter,
  });
  return {
    dom,
    document,
    view,
    get presenterOptions() {
      return presenterOptions;
    },
    get autoFullscreenCalls() {
      return autoFullscreenCalls;
    },
    get closeCalls() {
      return closeCalls;
    },
    resize(width, height) {
      viewportWidth = width;
      viewportHeight = height;
    },
  };
}

describe("scripture web view", () => {
  it("navigates first/last boundaries without rebuilding unchanged slides", async () => {
    const f = fixture();
    await f.view.loadSession();
    const canvas = f.document.getElementById("stageCanvas");
    const firstNode = canvas.firstElementChild;
    assert.equal(
      firstNode.querySelector(".slide-bg").style.backgroundColor,
      "rgb(17, 34, 51)",
    );
    assert.match(firstNode.textContent, /첫 슬라이드/);

    f.view.navigate("first");
    f.view.navigate("previous");
    assert.equal(canvas.firstElementChild, firstNode);
    assert.equal(
      f.document.getElementById("slideCounter").textContent,
      "1 / 2",
    );

    f.view.navigate("last");
    const lastNode = canvas.firstElementChild;
    assert.notEqual(lastNode, firstNode);
    assert.match(lastNode.textContent, /마지막 슬라이드/);
    assert.equal(
      f.document.getElementById("slideCounter").textContent,
      "2 / 2",
    );

    f.view.navigate("next");
    f.view.navigate("last");
    assert.equal(canvas.firstElementChild, lastNode);

    f.presenterOptions.onBlackoutChange(true);
    f.view.navigate("previous");
    assert.equal(canvas.firstElementChild, lastNode);
    f.presenterOptions.onBlackoutChange(false);
    f.view.navigate("previous");
    assert.notEqual(canvas.firstElementChild, lastNode);
    f.dom.window.close();
  });

  it("auto-enters fullscreen after render and rescales on fullscreen changes", async () => {
    const f = fixture();
    await f.view.loadSession();

    assert.equal(f.autoFullscreenCalls, 1);
    assert.equal(typeof f.presenterOptions.onFullscreenChange, "function");

    f.resize(666.5, 375);
    f.presenterOptions.onFullscreenChange(true);
    assert.equal(
      f.document.getElementById("stageCanvas").style.transform,
      "scale(0.5)",
    );
    f.dom.window.close();
  });

  it("renders a close action when session data loading fails", async () => {
    const f = fixture({
      response: {
        ok: false,
        json: async () => ({ error: "세션이 만료되었습니다." }),
      },
    });

    await f.view.loadSession();

    const close = f.document.querySelector(".state-close-button");
    assert.match(
      f.document.getElementById("stageCanvas").textContent,
      /세션이 만료/,
    );
    assert.equal(close?.textContent, "창 닫기");
    close.click();
    assert.equal(f.closeCalls, 1);
    f.dom.window.close();
  });

  it("renders a close action when the session id is missing", async () => {
    const f = fixture({
      url: "https://example.test/scripture-web-view.html",
    });

    await f.view.loadSession();

    assert.equal(
      f.document.querySelector(".state-close-button")?.textContent,
      "창 닫기",
    );
    f.dom.window.close();
  });
});
