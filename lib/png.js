// Minimal PNG writer for the gradient backgrounds. PptxGenJS embeds image bytes
// verbatim, so the decks need a real raster part: an SVG data URI makes it emit
// an SVG part plus a raster fallback holding the very same bytes, and the merge
// step shares media parts by content checksum, which collapses that pair into
// one ".png" part full of SVG text that PowerPoint cannot decode.

import zlib from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BYTES_PER_PIXEL = 4; // 8-bit RGBA
const COLOUR_TYPE_RGBA = 6;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** Sum of each byte read as a signed delta, the usual filter heuristic. */
function filterCost(row) {
  let total = 0;
  for (let i = 0; i < row.length; i += 1) {
    total += row[i] < 128 ? row[i] : 256 - row[i];
  }
  return total;
}

// Smooth gradients shrink far better with a delta filter than without one, so
// each row keeps whichever of None/Sub/Up predicts it best.
function filterScanlines({ width, height, data }) {
  const stride = width * BYTES_PER_PIXEL;
  const out = Buffer.alloc(height * (1 + stride));
  const candidates = [
    { type: 0, row: Buffer.alloc(stride) },
    { type: 1, row: Buffer.alloc(stride) },
    { type: 2, row: Buffer.alloc(stride) },
  ];
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const row = data.subarray(y * stride, y * stride + stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= BYTES_PER_PIXEL ? row[i - BYTES_PER_PIXEL] : 0;
      candidates[0].row[i] = row[i];
      candidates[1].row[i] = (row[i] - left) & 0xff;
      candidates[2].row[i] = (row[i] - previous[i]) & 0xff;
    }

    let best = candidates[0];
    let bestCost = Infinity;
    for (const candidate of candidates) {
      const cost = filterCost(candidate.row);
      if (cost < bestCost) {
        bestCost = cost;
        best = candidate;
      }
    }

    const offset = y * (1 + stride);
    out[offset] = best.type;
    best.row.copy(out, offset + 1);
    previous = row;
  }

  return out;
}

/** Encodes 8-bit RGBA pixels as a PNG buffer. */
export function encodePng({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`PNG 크기가 올바르지 않습니다: ${width}x${height}`);
  }
  const expected = width * height * BYTES_PER_PIXEL;
  if (!Buffer.isBuffer(data) || data.length !== expected) {
    throw new Error(`PNG 픽셀 데이터 길이가 맞지 않습니다: ${data?.length} != ${expected}`);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = COLOUR_TYPE_RGBA;
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(filterScanlines({ width, height, data }), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
