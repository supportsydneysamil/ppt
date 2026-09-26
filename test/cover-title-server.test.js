import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import AdmZip from "adm-zip";

import {
  buildCombinedSlidesDeck,
  buildPptx,
} from "../server.js";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const serverPath = path.join(projectRoot, "server.js");

function launchUntilReady(entryPath, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ENABLE_VITE: "0",
        NODE_ENV: "production",
        PORT: "0",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error(`server startup timed out\n${stdout}\n${stderr}`));
    }, 3000);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const complete = () =>
        error ? reject(error) : resolve({ stdout, stderr });
      if (child.exitCode === null) {
        child.once("exit", complete);
        child.kill("SIGTERM");
      } else {
        complete();
      }
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("Server running on")) {
        finish();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", finish);
    child.once("exit", (code, signal) => {
      if (!settled) {
        finish(
          new Error(
            `server exited before startup (code ${code}, signal ${signal})\n${stdout}\n${stderr}`
          )
        );
      }
    });
  });
}

function slideXmlEntries(buffer) {
  return new AdmZip(buffer)
    .getEntries()
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName))
    .sort((left, right) => left.entryName.localeCompare(right.entryName, undefined, {
      numeric: true,
    }));
}

function slideTexts(entry) {
  return [...entry.getData().toString("utf8").matchAll(/<a:t>([^<]*)<\/a:t>/g)]
    .map((match) => match[1]);
}

async function hymnBundle(overrides = {}) {
  return buildCombinedSlidesDeck([
    {
      id: "hymn-1",
      name: "테스트 찬송",
      type: "hymn",
      sourceType: "generated",
      content: "본문 내용",
      includeTitle: true,
      titleThemeId: "original",
      hymnNumber: 1,
      hymnKorTitle: "찬양하라",
      hymnEngTitle: "Praise Him",
      ...overrides,
    },
  ]);
}

const scripturePayload = {
  lines: {
    ko: ["1. 태초에 하나님이 천지를 창조하시니라"],
  },
  meta: {
    chapterNum: 1,
    bookEntry: {
      name: "창세기",
      slugEn: "genesis",
      abbrKo: "창",
      abbrEn: "Gen",
    },
  },
};

async function scriptureDeck(options) {
  const pptx = buildPptx(scripturePayload, undefined, options);
  return pptx.write({ outputType: "nodebuffer" });
}

describe("server cover title routing", () => {
  it("imports without startup side effects when Vite is enabled", async () => {
    const serverUrl = new URL("../server.js", import.meta.url).href;
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(serverUrl)}); console.log("imported");`,
      ],
      {
        env: { ...process.env, ENABLE_VITE: "1" },
        timeout: 3000,
      }
    );

    assert.equal(stdout, "imported\n");
  });

  it("starts from both canonical and symlinked direct launch paths", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "samil-server-"));
    const symlinkPath = path.join(tempDir, "server-link.js");

    try {
      await fs.symlink(serverPath, symlinkPath);
      for (const entryPath of [serverPath, symlinkPath]) {
        const { stdout } = await launchUntilReady(entryPath);
        assert.match(stdout, /Server running on http:\/\/0\.0\.0\.0:\d+/);
      }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("uses the next open port when the requested one is taken", async () => {
    const blocker = net.createServer();
    const taken = await new Promise((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "0.0.0.0", () => resolve(blocker.address().port));
    });

    try {
      const { stdout } = await launchUntilReady(serverPath, { PORT: String(taken) });
      const moved = stdout.match(/Port (\d+) is in use, using (\d+) instead/);
      const running = stdout.match(/Server running on http:\/\/0\.0\.0\.0:(\d+)/);
      assert.ok(moved, stdout);
      assert.equal(Number(moved[1]), taken);
      assert.equal(running?.[1], moved[2]);
      assert.notEqual(Number(running[1]), taken);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  it("keeps the original image-based hymn title slide", async () => {
    const slides = slideXmlEntries(await hymnBundle());

    assert.equal(slides.length, 2);
    assert.deepEqual(slideTexts(slides[0]).slice(0, 3), ["찬", "송", "HYMN"]);
    assert.match(slides[0].getData().toString("utf8"), /<p:pic>/);
  });

  it("routes an aurora hymn title through the shared themed renderer", async () => {
    const slides = slideXmlEntries(
      await hymnBundle({ titleThemeId: "aurora" })
    );

    assert.equal(slides.length, 2);
    assert.deepEqual(slideTexts(slides[0]).slice(0, 3), [
      "찬송",
      "HYMN",
      "1. 찬양하라",
    ]);
  });

  it("keeps the original scripture title slide", async () => {
    const slides = slideXmlEntries(
      await scriptureDeck({
        includeTitleSlide: true,
        titleSlideType: "말씀",
        titleThemeId: "original",
        referenceText: "창세기 (Genesis) 1:1",
      })
    );

    assert.equal(slides.length, 2);
    assert.deepEqual(slideTexts(slides[0]).slice(0, 5), [
      "성",
      "경",
      "말",
      "씀",
      "SCRIPTURES",
    ]);
  });

  it("maps an aurora scripture-reading title to the themed reading text", async () => {
    const slides = slideXmlEntries(
      await scriptureDeck({
        includeTitleSlide: true,
        titleSlideType: "봉독",
        titleThemeId: "aurora",
        referenceText: "창세기 (Genesis) 1:1",
      })
    );

    assert.equal(slides.length, 2);
    assert.deepEqual(slideTexts(slides[0]).slice(0, 3), [
      "성경봉독",
      "SCRIPTURE READING",
      "창세기 (Genesis) 1:1",
    ]);
  });

  it("routes invalid hymn and scripture theme IDs to original", async () => {
    const hymnSlides = slideXmlEntries(
      await hymnBundle({ titleThemeId: "unknown" })
    );
    const scriptureSlides = slideXmlEntries(
      await scriptureDeck({
        includeTitleSlide: true,
        titleSlideType: "봉독",
        titleThemeId: "unknown",
        referenceText: "창세기 (Genesis) 1:1",
      })
    );

    assert.deepEqual(slideTexts(hymnSlides[0]).slice(0, 3), [
      "찬",
      "송",
      "HYMN",
    ]);
    assert.deepEqual(slideTexts(scriptureSlides[0]).slice(0, 5), [
      "성",
      "경",
      "봉",
      "독",
      "SCRIPTURE READING",
    ]);
  });

  it("adds no hymn or scripture cover when title inclusion is disabled", async () => {
    const hymnSlides = slideXmlEntries(
      await hymnBundle({ includeTitle: false, titleThemeId: "aurora" })
    );
    const scriptureSlides = slideXmlEntries(
      await scriptureDeck({
        includeTitleSlide: false,
        titleSlideType: "봉독",
        titleThemeId: "aurora",
        referenceText: "창세기 (Genesis) 1:1",
      })
    );

    assert.equal(hymnSlides.length, 1);
    assert.equal(scriptureSlides.length, 1);
    assert.doesNotMatch(
      hymnSlides[0].getData().toString("utf8"),
      /찬송|HYMN/
    );
    assert.doesNotMatch(
      scriptureSlides[0].getData().toString("utf8"),
      /성경봉독|SCRIPTURE READING/
    );
  });
});
