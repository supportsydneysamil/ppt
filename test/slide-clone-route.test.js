import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const UPLOADS_DIR = path.join(ROOT, "uploads");
const SLIDES_PATH = path.join(ROOT, "data", "slides.json");
const READY = /Server running on http:\/\/0\.0\.0\.0:(\d+)/;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stderr = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`server did not start: ${output}${stderr.join("")}`)),
      30000
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (READY.test(output)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}: ${stderr.join("")}`));
    });
  });

  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    },
  };
}

test("POST /api/slides/clone copies owned assets without persisting", async (t) => {
  const token = `clone-route-${process.pid}-${Date.now()}`;
  const sourceNames = ["deck.pptx", "thumb.jpeg", "background.png", "picture.png"];
  const sourcePaths = sourceNames.map((name) => path.join(UPLOADS_DIR, `${token}-${name}`));
  await Promise.all(
    sourcePaths.map((filePath, index) => fs.writeFile(filePath, `asset-${index}`))
  );
  t.after(async () => {
    const entries = await fs.readdir(UPLOADS_DIR);
    await Promise.all(
      entries
        .filter((name) => name.startsWith(token))
        .map((name) => fs.rm(path.join(UPLOADS_DIR, name), { force: true }))
    );
  });

  const server = await startServer();
  t.after(() => server.stop());
  const slidesBefore = await fs.readFile(SLIDES_PATH, "utf8");
  const uploadPath = (name) => `/uploads/${token}-${name}`;
  const slide = {
    id: "original-slide",
    name: "복제할 슬라이드",
    type: "custom",
    sourceType: "upload",
    serverFilePath: uploadPath("deck.pptx"),
    thumbnail: uploadPath("thumb.jpeg"),
    adBgImagePath: uploadPath("background.png"),
    runtimeOnlyField: "drop-me",
    customSlide: {
      version: 1,
      width: 1280,
      height: 720,
      background: { color: "#ffffff" },
      elements: [
        {
          id: "picture-a",
          type: "image",
          src: uploadPath("picture.png"),
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
        {
          id: "picture-b",
          type: "image",
          src: uploadPath("picture.png"),
          x: 100,
          y: 0,
          width: 100,
          height: 100,
        },
      ],
    },
  };

  const response = await fetch(`${server.url}/api/slides/clone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slide }),
  });
  assert.equal(response.status, 200);

  const clone = await response.json();
  assert.notEqual(clone.id, slide.id);
  assert.equal(clone.runtimeOnlyField, undefined);
  for (const field of ["serverFilePath", "thumbnail", "adBgImagePath"]) {
    assert.notEqual(clone[field], slide[field], `${field} must be independently copied`);
    assert.equal(await fs.readFile(path.join(ROOT, clone[field]), "utf8"), await fs.readFile(path.join(ROOT, slide[field]), "utf8"));
  }
  const [firstImage, secondImage] = clone.customSlide.elements;
  assert.notEqual(firstImage.src, slide.customSlide.elements[0].src);
  assert.equal(firstImage.src, secondImage.src, "a distinct source is copied only once");
  assert.equal(
    await fs.readFile(path.join(ROOT, firstImage.src), "utf8"),
    await fs.readFile(path.join(ROOT, slide.customSlide.elements[0].src), "utf8")
  );
  assert.notEqual(firstImage.id, slide.customSlide.elements[0].id);
  assert.equal(await fs.readFile(SLIDES_PATH, "utf8"), slidesBefore);

  const malformed = await fetch(`${server.url}/api/slides/clone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slide: "not-a-record" }),
  });
  assert.equal(malformed.status, 400);
  assert.equal(typeof (await malformed.json()).error, "string");
});
