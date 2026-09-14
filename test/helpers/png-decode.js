// Decoder for the 8-bit RGBA PNGs lib/png.js writes, so tests can assert on the
// pixels a slide actually shows rather than on the description that produced it.
import zlib from "node:zlib";

const BYTES_PER_PIXEL = 4;

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(buffer) {
  let offset = 8; // signature
  let width = 0;
  let height = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("latin1");
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) {
        throw new Error(`unsupported PNG: depth=${data[8]} colourType=${data[9]}`);
      }
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length; // length + type + data + crc
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * BYTES_PER_PIXEL;
  const pixels = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (1 + stride)];
    const source = raw.subarray(y * (1 + stride) + 1, y * (1 + stride) + 1 + stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= BYTES_PER_PIXEL ? pixels[y * stride + i - BYTES_PER_PIXEL] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const upLeft =
        y > 0 && i >= BYTES_PER_PIXEL ? pixels[(y - 1) * stride + i - BYTES_PER_PIXEL] : 0;

      let value = source[i];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`unsupported PNG row filter ${filter}`);

      pixels[y * stride + i] = value & 0xff;
    }
  }

  return { width, height, data: pixels };
}

export function pixelAt({ width, data }, x, y) {
  const offset = (y * width + x) * BYTES_PER_PIXEL;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}
