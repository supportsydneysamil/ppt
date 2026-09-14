// A slide background that comes from a URL must never be embedded unchecked. An
// error page or any non-image response has to be skipped and reported, because
// embedding those bytes produced a slide PowerPoint could not display.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

import { encodePng } from "../lib/png.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
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
    const timer = setTimeout(() => {
      reject(new Error(`server did not start: ${output}${stderr.join("")}`));
    }, 30000);
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

/** Serves one real PNG and one HTML page pretending to be a JPEG. */
async function startImageHost() {
  const png = encodePng({ width: 4, height: 4, data: Buffer.alloc(4 * 4 * 4, 0x80) });
  const server = http.createServer((req, res) => {
    if (req.url === "/real.png") {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(png);
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<!doctype html><html><body>not an image</body></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

function adSlide(id, adBgImageUrl) {
  return {
    id,
    name: `광고 ${id}`,
    type: "ad",
    sourceType: "basic",
    saved: true,
    content: "본문",
    adTitle: "제목",
    adTitleSize: "medium",
    adBgSource: "url",
    adBgImageUrl,
    adBgOpacity: 30,
  };
}

function mediaEntries(buffer) {
  return new AdmZip(buffer)
    .getEntries()
    .filter((entry) => entry.entryName.startsWith("ppt/media/") && !entry.entryName.endsWith("/"));
}

test("URL slide backgrounds are validated before embedding", { timeout: 120000 }, async (t) => {
  const host = await startImageHost();
  t.after(() => host.stop());
  const server = await startServer();
  t.after(() => server.stop());

  await t.test("skips a background whose URL does not return an image", async () => {
    const response = await fetch(`${server.url}/api/slides/export-pptx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: [adSlide("bad", `${host.url}/not-an-image.jpg`)] }),
    });

    assert.equal(response.status, 200, "one bad URL must not fail the whole bundle");
    assert.equal(response.headers.get("X-Custom-Slide-Warnings"), "1");

    const buffer = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(
      mediaEntries(buffer).map((entry) => entry.entryName),
      [],
      "nothing may be embedded when the response was not an image"
    );
  });

  await t.test("embeds a real image and labels it from its bytes", async () => {
    const response = await fetch(`${server.url}/api/slides/export-pptx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: [adSlide("good", `${host.url}/real.png`)] }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Custom-Slide-Warnings"), "0");

    const media = mediaEntries(Buffer.from(await response.arrayBuffer()));
    assert.equal(media.length, 1);
    assert.equal(path.extname(media[0].entryName), ".png");
    assert.deepEqual(
      media[0].getData().subarray(0, 8),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });
});
