import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

import {
  createScripturePresenter,
  navigationFromKey,
  navigationFromSwipe,
  navigationFromTap,
} from "../public/scripture-web-presenter.js";

const WEB_VIEW_HTML = readFileSync(
  new URL("../public/scripture-web-view.html", import.meta.url),
  "utf8"
);
const WEB_VIEW_CSS = readFileSync(
  new URL("../public/scripture-web-view.css", import.meta.url),
  "utf8"
);

const MARKUP = `<!doctype html><html lang="ko"><body>
  <div id="presenterControls">
    <button id="prevBtn" type="button">이전</button>
    <button id="fullscreenBtn" type="button">전체화면</button>
    <button id="blackoutBtn" type="button" aria-pressed="false">검정 화면</button>
  </div>
  <div id="stageViewport"><div id="stageCanvas"></div></div>
  <div id="fullscreenStart" hidden>
    <p id="fullscreenMessage"></p>
    <button id="fullscreenStartBtn" type="button">
      <span class="start-cta">전체화면으로 시작</span>
    </button>
    <p class="fullscreen-hint"><kbd>F</kbd> 키로도 시작할 수 있습니다</p>
  </div>
  <div id="blackoutLayer" hidden></div>
</body></html>`;

const HIDE_DELAY = 20;

function createFixture({ fullscreen = "granted" } = {}) {
  const dom = new JSDOM(MARKUP, { url: "https://example.test/" });
  const { window } = dom;
  const { document } = window;
  const requests = [];
  const moves = [];
  let fullscreenElement = null;
  let outcome = fullscreen;

  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });

  if (fullscreen !== "unsupported") {
    document.documentElement.requestFullscreen = async (options) => {
      requests.push(options);
      if (outcome === "denied") {
        throw new Error("fullscreen denied by user activation policy");
      }
      fullscreenElement = document.documentElement;
      document.dispatchEvent(new window.Event("fullscreenchange"));
    };
    document.exitFullscreen = async () => {
      fullscreenElement = null;
      document.dispatchEvent(new window.Event("fullscreenchange"));
    };
  }

  const presenter = createScripturePresenter({
    document,
    window,
    hideDelay: HIDE_DELAY,
    onNavigate: (direction) => moves.push(direction),
  });

  return {
    window,
    document,
    presenter,
    requests,
    moves,
    grantFullscreen: () => {
      outcome = "granted";
    },
  };
}

function press(window, key, target = window.document, init = {}) {
  target.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    })
  );
}

function pointer(window, node, type, clientX, clientY = 300) {
  node.dispatchEvent(
    new window.MouseEvent(type, {
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
    })
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("scripture presenter DOM contract", () => {
  it("provides the presenter controls and overlays", () => {
    const { document } = new JSDOM(WEB_VIEW_HTML).window;

    for (const id of [
      "presenterControls",
      "fullscreenBtn",
      "blackoutBtn",
      "fullscreenStart",
      "fullscreenStartBtn",
      "fullscreenMessage",
      "blackoutLayer",
    ]) {
      assert.ok(document.getElementById(id), `${id} is missing`);
    }

    assert.equal(
      document.getElementById("blackoutBtn").getAttribute("aria-pressed"),
      "false"
    );
    assert.equal(document.getElementById("blackoutLayer").hidden, true);
    assert.match(
      document.getElementById("fullscreenStartBtn").textContent,
      /전체화면으로 시작/
    );
  });

  it("provides fullscreen, blackout, and reduced-motion styles", () => {
    assert.match(WEB_VIEW_CSS, /body\.is-presenting/);
    assert.match(WEB_VIEW_CSS, /\.blackout-layer/);
    assert.match(WEB_VIEW_CSS, /prefers-reduced-motion/);
    assert.match(
      WEB_VIEW_CSS,
      /\.fullscreen-start\.is-unsupported\s+\.fullscreen-hint/
    );
  });

  it("ties the presentation cursor to the visible controls window", () => {
    assert.match(
      WEB_VIEW_CSS,
      /body\.is-presenting\s*\{[^}]*cursor:\s*none/,
      "the presenting page must hide the cursor by default"
    );
    assert.match(
      WEB_VIEW_CSS,
      /body\.is-presenting:has\(\.presenter-controls\.controls-visible\)\s*\{[^}]*cursor:\s*default/,
      "the cursor must return whenever the controls are visible"
    );
  });

  it("keeps presenting controls in one row on narrow screens", () => {
    assert.match(
      WEB_VIEW_CSS,
      /@media \(max-width: 900px\)[\s\S]*body\.is-presenting \.webview-topbar/,
      "the narrow-screen topbar must not stack while presenting"
    );
  });
});

describe("scripture presenter input", () => {
  it("maps presentation keys and ignores Space on controls", () => {
    assert.equal(navigationFromKey({ key: "ArrowRight" }), "next");
    assert.equal(navigationFromKey({ key: "ArrowDown" }), "next");
    assert.equal(navigationFromKey({ key: "PageDown" }), "next");
    assert.equal(navigationFromKey({ key: " " }), "next");
    assert.equal(navigationFromKey({ key: "ArrowLeft" }), "previous");
    assert.equal(navigationFromKey({ key: "ArrowUp" }), "previous");
    assert.equal(navigationFromKey({ key: "PageUp" }), "previous");
    assert.equal(navigationFromKey({ key: "Home" }), "first");
    assert.equal(navigationFromKey({ key: "End" }), "last");
    assert.equal(navigationFromKey({ key: "a" }), null);
    assert.equal(
      navigationFromKey({ key: " ", target: { closest: () => ({}) } }),
      null
    );
    assert.equal(
      navigationFromKey({ key: "ArrowRight", target: { closest: () => null } }),
      "next"
    );
  });

  it("maps tap halves and deliberate horizontal swipes", () => {
    assert.equal(navigationFromTap(20, 100), "previous");
    assert.equal(navigationFromTap(80, 100), "next");
    assert.equal(navigationFromTap(20, 0), null);
    assert.equal(navigationFromTap(20, Number.NaN), null);
    assert.equal(
      navigationFromSwipe({ x: 100, y: 20 }, { x: 20, y: 24 }),
      "next"
    );
    assert.equal(
      navigationFromSwipe({ x: 20, y: 20 }, { x: 100, y: 24 }),
      "previous"
    );
    assert.equal(
      navigationFromSwipe({ x: 20, y: 20 }, { x: 45, y: 80 }),
      null
    );
    assert.equal(
      navigationFromSwipe({ x: 20, y: 20 }, { x: 60, y: 24 }),
      null,
      "short horizontal drags must not navigate"
    );
  });
});

describe("scripture presenter controller", () => {
  it("tracks presentation mode from fullscreenchange", async () => {
    const { document, presenter, requests } = createFixture();

    await presenter.attemptAutoFullscreen();

    assert.deepEqual(requests, [{ navigationUI: "hide" }]);
    assert.ok(document.body.classList.contains("is-presenting"));
    assert.equal(
      document.getElementById("fullscreenBtn").textContent,
      "전체화면 종료"
    );
    assert.equal(document.getElementById("fullscreenStart").hidden, true);

    await presenter.requestFullscreen();

    assert.equal(document.body.classList.contains("is-presenting"), false);
    assert.equal(
      document.getElementById("fullscreenBtn").textContent,
      "전체화면"
    );
    presenter.destroy();
  });

  it("offers a start button when automatic fullscreen is rejected", async () => {
    const { document, presenter } = createFixture({ fullscreen: "denied" });

    await presenter.attemptAutoFullscreen();

    assert.equal(document.getElementById("fullscreenStart").hidden, false);
    assert.equal(
      document.getElementById("fullscreenMessage").textContent,
      "전체화면으로 시작"
    );
    assert.equal(document.getElementById("fullscreenStartBtn").hidden, false);
    assert.equal(document.body.classList.contains("is-presenting"), false);
    presenter.destroy();
  });

  it("explains when the browser has no Fullscreen API", async () => {
    const { document, presenter } = createFixture({ fullscreen: "unsupported" });

    await presenter.attemptAutoFullscreen();

    const start = document.getElementById("fullscreenStart");
    assert.equal(start.hidden, false);
    assert.equal(
      document.getElementById("fullscreenMessage").textContent,
      "이 브라우저에서는 전체화면을 지원하지 않습니다"
    );
    assert.equal(document.getElementById("fullscreenStartBtn").hidden, true);
    assert.ok(
      start.classList.contains("is-unsupported"),
      "the F hint must be suppressible when fullscreen cannot work"
    );
    assert.ok(start.querySelector(".fullscreen-hint"));
    presenter.destroy();
  });

  it("starts fullscreen from the fallback button and keeps its rich CTA", async () => {
    const { document, presenter, grantFullscreen } = createFixture({
      fullscreen: "denied",
    });

    await presenter.attemptAutoFullscreen();

    const start = document.getElementById("fullscreenStart");
    const startBtn = document.getElementById("fullscreenStartBtn");
    assert.equal(
      startBtn.querySelector(".start-cta").textContent,
      "전체화면으로 시작"
    );
    assert.ok(start.querySelector(".fullscreen-hint"));
    assert.equal(start.classList.contains("is-unsupported"), false);

    grantFullscreen();
    startBtn.click();
    await sleep(0);

    assert.ok(document.body.classList.contains("is-presenting"));
    assert.equal(start.hidden, true);
    assert.equal(
      startBtn.querySelector(".start-cta").textContent,
      "전체화면으로 시작"
    );
    presenter.destroy();
  });

  it("routes F and B even while a presenter control has focus", async () => {
    const { window, document, presenter, requests, moves } = createFixture();
    const fullscreenBtn = document.getElementById("fullscreenBtn");
    const blackoutBtn = document.getElementById("blackoutBtn");

    fullscreenBtn.focus();
    press(window, "f", fullscreenBtn);
    await sleep(0);

    assert.equal(requests.length, 1);
    assert.ok(document.body.classList.contains("is-presenting"));

    press(window, "B", blackoutBtn);
    assert.ok(document.body.classList.contains("is-blackout"));

    press(window, " ", fullscreenBtn);
    assert.deepEqual(moves, [], "Space on a control must stay a button press");

    press(window, "f", fullscreenBtn, { ctrlKey: true });
    await sleep(0);
    assert.equal(requests.length, 1, "browser shortcuts must pass through");
    presenter.destroy();
  });

  it("toggles the blackout layer and its pressed state", () => {
    const { window, document, presenter } = createFixture();
    const layer = document.getElementById("blackoutLayer");
    const button = document.getElementById("blackoutBtn");

    presenter.toggleBlackout();

    assert.ok(document.body.classList.contains("is-blackout"));
    assert.equal(layer.hidden, false);
    assert.equal(button.getAttribute("aria-pressed"), "true");

    press(window, "b");

    assert.equal(document.body.classList.contains("is-blackout"), false);
    assert.equal(layer.hidden, true);
    assert.equal(button.getAttribute("aria-pressed"), "false");
    presenter.destroy();
  });

  it("routes keyboard, click, and swipe navigation", () => {
    const { window, document, presenter, moves } = createFixture();
    const stage = document.getElementById("stageViewport");

    press(window, "ArrowRight");
    press(window, "ArrowLeft");
    press(window, "Home");
    press(window, "End");
    press(window, " ", document.getElementById("fullscreenBtn"));

    assert.deepEqual(moves, ["next", "previous", "first", "last"]);

    pointer(window, stage, "click", 900);
    pointer(window, stage, "click", 100);

    assert.deepEqual(moves.slice(4), ["next", "previous"]);

    pointer(window, stage, "pointerdown", 900);
    pointer(window, stage, "pointerup", 200, 320);
    pointer(window, stage, "click", 200);

    assert.deepEqual(
      moves.slice(6),
      ["next"],
      "a swipe must not also fire a tap"
    );
    presenter.destroy();
  });

  it("shows controls on pointer movement and hides them after the delay", async () => {
    const { window, document, presenter } = createFixture();
    const controls = document.getElementById("presenterControls");

    await presenter.attemptAutoFullscreen();
    assert.equal(controls.classList.contains("controls-visible"), false);

    pointer(window, document.body, "pointermove", 400);
    assert.ok(controls.classList.contains("controls-visible"));

    await sleep(HIDE_DELAY * 4);
    assert.equal(controls.classList.contains("controls-visible"), false);

    pointer(window, controls, "pointerenter", 400);
    presenter.showControls();
    await sleep(HIDE_DELAY * 4);
    assert.ok(
      controls.classList.contains("controls-visible"),
      "hovered controls must stay visible"
    );

    pointer(window, controls, "pointerleave", 400);
    await sleep(HIDE_DELAY * 4);
    assert.equal(controls.classList.contains("controls-visible"), false);
    presenter.destroy();
  });

  it("completes swipes that end outside the stage and drops cancelled ones", () => {
    const { window, document, presenter, moves } = createFixture();
    const stage = document.getElementById("stageViewport");

    pointer(window, stage, "pointerdown", 900);
    pointer(window, document.body, "pointerup", 200, 320);

    assert.deepEqual(moves, ["next"], "a swipe may finish outside the stage");

    pointer(window, stage, "pointerdown", 200);
    pointer(window, document.body, "pointercancel", 900, 320);
    pointer(window, document.body, "pointerup", 900, 320);

    assert.deepEqual(moves, ["next"], "a cancelled pointer must not navigate");

    pointer(window, stage, "click", 100);

    assert.deepEqual(
      moves,
      ["next", "previous"],
      "a cancelled swipe must not leave stale state behind"
    );
    presenter.destroy();
  });

  it("keeps controls visible while focus stays inside them", async () => {
    const { document, presenter } = createFixture();
    const controls = document.getElementById("presenterControls");
    const fullscreenBtn = document.getElementById("fullscreenBtn");

    fullscreenBtn.focus();
    presenter.showControls();

    await sleep(HIDE_DELAY * 4);
    assert.ok(
      controls.classList.contains("controls-visible"),
      "focused controls must stay visible"
    );

    fullscreenBtn.blur();
    await sleep(HIDE_DELAY * 4);
    assert.equal(controls.classList.contains("controls-visible"), false);
    presenter.destroy();
  });

  it("removes listeners and the hide timer on destroy", async () => {
    const { window, document, presenter, moves } = createFixture();
    const controls = document.getElementById("presenterControls");

    presenter.showControls();
    presenter.destroy();

    await sleep(HIDE_DELAY * 4);
    assert.ok(
      controls.classList.contains("controls-visible"),
      "destroy must clear the pending hide timer"
    );

    press(window, "ArrowRight");
    press(window, "f");
    pointer(window, document.getElementById("stageViewport"), "click", 900);
    pointer(window, document.getElementById("stageViewport"), "pointerdown", 900);
    pointer(window, document.body, "pointerup", 200, 320);
    document.getElementById("blackoutBtn").click();

    assert.deepEqual(moves, []);
    assert.equal(document.body.classList.contains("is-blackout"), false);
  });
});
