// Downloads an image for a slide background. Every response is checked before it
// becomes a picture: the old code embedded whatever bytes arrived and always
// labelled them JPEG, so an error page or a redirect notice turned into a
// "the picture can't be displayed" slide.

import http from "node:http";
import https from "node:https";

const MAX_REDIRECTS = 3;
const MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The image format the bytes really are, or null when it is not an image. */
export function sniffImageMimeType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString("latin1"))) {
    return "image/gif";
  }
  return null;
}

function get(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`이미지 주소를 읽을 수 없습니다: ${url}`));
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      reject(new Error(`http 또는 https 이미지 주소만 사용할 수 있습니다: ${url}`));
      return;
    }

    const request = (parsed.protocol === "https:" ? https : http).get(parsed, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          request.destroy();
          reject(new Error("배경 이미지가 너무 큽니다."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode,
          location: response.headers.location,
          body: Buffer.concat(chunks),
        });
      });
      response.on("error", reject);
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy();
      reject(new Error(`배경 이미지를 가져오는 데 시간이 너무 걸립니다: ${url}`));
    });
    request.on("error", reject);
  });
}

/**
 * Fetches `url` and returns a data URI whose media type is taken from the bytes.
 * Throws with a readable reason for anything that is not a usable image.
 */
export async function fetchRemoteImage(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let current = url;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await get(current, timeoutMs);

    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      current = new URL(response.location, current).toString();
      continue;
    }
    if (response.statusCode !== 200) {
      throw new Error(
        `배경 이미지를 가져올 수 없습니다 (HTTP ${response.statusCode}): ${url}`
      );
    }

    const mimeType = sniffImageMimeType(response.body);
    if (!mimeType) {
      throw new Error(`배경 주소가 이미지가 아닙니다: ${url}`);
    }
    return `data:${mimeType};base64,${response.body.toString("base64")}`;
  }

  throw new Error(`배경 이미지 리다이렉트가 너무 많습니다: ${url}`);
}
