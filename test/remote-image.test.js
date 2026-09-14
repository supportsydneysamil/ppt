// The ad background can come from a URL. Whatever comes back used to be
// embedded as JPEG regardless of what it was, so a 404 page or an HTML redirect
// notice became a picture PowerPoint could not display.
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";

import { encodePng } from "../lib/png.js";
import { fetchRemoteImage } from "../lib/remote-image.js";

const PNG = encodePng({ width: 2, height: 2, data: Buffer.alloc(2 * 2 * 4, 0x40) });
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 0x11),
  Buffer.from([0xff, 0xd9]),
]);

let server;
let origin;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/real.png") {
      // Deliberately mislabelled: the bytes decide, not the header.
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(PNG);
      return;
    }
    if (req.url === "/photo.jpg") {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(JPEG);
      return;
    }
    if (req.url === "/not-an-image.jpg") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><html><body>no image here</body></html>");
      return;
    }
    if (req.url === "/missing.jpg") {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("<!doctype html><html><body>not found</body></html>");
      return;
    }
    if (req.url === "/moved.jpg") {
      res.writeHead(302, { Location: "/real.png" });
      res.end();
      return;
    }
    if (req.url === "/loop.jpg") {
      res.writeHead(302, { Location: "/loop.jpg" });
      res.end();
      return;
    }
    if (req.url === "/slow.jpg") {
      // Never responds, so the caller has to time out.
      return;
    }
    res.writeHead(500);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

describe("fetchRemoteImage", () => {
  it("labels the data URI from the bytes, not the response header", async () => {
    const dataUri = await fetchRemoteImage(`${origin}/real.png`);
    assert.match(dataUri, /^data:image\/png;base64,/);
    const decoded = Buffer.from(dataUri.split(",")[1], "base64");
    assert.deepEqual(decoded, PNG);
  });

  it("accepts a genuine JPEG", async () => {
    const dataUri = await fetchRemoteImage(`${origin}/photo.jpg`);
    assert.match(dataUri, /^data:image\/jpeg;base64,/);
  });

  it("refuses a page that is not an image even when the status is 200", async () => {
    await assert.rejects(fetchRemoteImage(`${origin}/not-an-image.jpg`), /이미지/);
  });

  it("refuses an error response", async () => {
    await assert.rejects(fetchRemoteImage(`${origin}/missing.jpg`), /404/);
  });

  it("follows a redirect to the real image", async () => {
    const dataUri = await fetchRemoteImage(`${origin}/moved.jpg`);
    assert.match(dataUri, /^data:image\/png;base64,/);
  });

  it("gives up on a redirect loop", async () => {
    await assert.rejects(fetchRemoteImage(`${origin}/loop.jpg`), /리다이렉트/);
  });

  it("times out instead of hanging the export", async () => {
    await assert.rejects(
      fetchRemoteImage(`${origin}/slow.jpg`, { timeoutMs: 150 }),
      /시간/
    );
  });

  it("refuses a non-http protocol", async () => {
    await assert.rejects(fetchRemoteImage("file:///etc/passwd"), /주소/);
  });
});
