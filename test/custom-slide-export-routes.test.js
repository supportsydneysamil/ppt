import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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

/**
 * The export routes only exist on the running app, so the deck is requested
 * from a real server instead of reaching into server.js internals.
 */
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

function customSlideWithMissingImage(id) {
  return {
    id,
    name: `커스텀 ${id}`,
    type: "custom",
    sourceType: "basic",
    saved: true,
    customSlide: {
      version: 1,
      width: 1280,
      height: 720,
      background: { color: "#ffffff" },
      elements: [
        {
          id: `${id}-image`,
          type: "image",
          src: "/uploads/absent-on-purpose.png",
          fit: "contain",
          x: 100,
          y: 100,
          width: 400,
          height: 300,
          rotation: 0,
          opacity: 1,
          zIndex: 0,
        },
      ],
    },
  };
}

test("custom slide exports report skipped pictures", { timeout: 120000 }, async (t) => {
  const server = await startServer();
  t.after(() => server.stop());

  await t.test("a single custom slide download counts its warnings", async () => {
    const response = await fetch(`${server.url}/api/create-custom-slide-pptx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customSlideWithMissingImage("single")),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Custom-Slide-Warnings"), "1");
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  });

  await t.test("a bulk export counts the warnings of every custom slide", async () => {
    const response = await fetch(`${server.url}/api/slides/export-pptx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slides: [
          customSlideWithMissingImage("bulk-a"),
          customSlideWithMissingImage("bulk-b"),
        ],
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("X-Custom-Slide-Warnings"),
      "2",
      "the bulk export must report the same count as the single download"
    );
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  });
});
