import CFB from "cfb";
import PptxGenJS from "pptxgenjs";
import { convertPptToPptx, isLegacyPpt, parseOle2 } from "pptx-viewer-core";

const BLIP_JPEG = 0xf01d;
const BLIP_PNG = 0xf01e;
const BLIP_DIB = 0xf01f;
const BLIP_TIFF = 0xf029;
const BLIP_JPEG_ALT = 0xf02a;
const RT_SLIDE = 0x03ee;
const WIDE = { width: 13.333, height: 7.5 };

function toBuffer(content) {
  if (Buffer.isBuffer(content)) {
    return content;
  }
  return Buffer.from(content);
}

function findStream(cfb, name) {
  const entry = CFB.find(cfb, name);
  if (!entry || entry.content == null) {
    return null;
  }
  return toBuffer(entry.content);
}

function walkRecords(buf, onRecord) {
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const verInst = buf.readUInt16LE(offset);
    const recInstance = verInst >> 4;
    const recType = buf.readUInt16LE(offset + 2);
    const recLen = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (dataStart + recLen > buf.length) {
      break;
    }
    onRecord({ recInstance, recType, recLen, dataStart, headerStart: offset });
    offset = dataStart + recLen;
  }
}

function blipPayload(buf, rec) {
  const uidBytes = rec.recInstance & 1 ? 32 : 16;
  const tagBytes = 1;
  const start = rec.dataStart + uidBytes + tagBytes;
  if (start >= rec.dataStart + rec.recLen) {
    return null;
  }
  return buf.subarray(start, rec.dataStart + rec.recLen);
}

function pngSize(data) {
  if (data.length < 24) {
    return null;
  }
  if (data.readUInt32BE(0) !== 0x89504e47 || data.readUInt32BE(4) !== 0x0d0a1a0a) {
    return null;
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function jpegSize(data) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return null;
  }
  let i = 2;
  while (i + 9 < data.length) {
    if (data[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = data[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    const size = data.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: data.readUInt16BE(i + 5),
        width: data.readUInt16BE(i + 7),
      };
    }
    i += 2 + size;
  }
  return null;
}

function describeBlip(recType, data) {
  if (recType === BLIP_PNG) {
    return { mime: "image/png", ext: "png", ...pngSize(data) };
  }
  if (recType === BLIP_JPEG || recType === BLIP_JPEG_ALT) {
    return { mime: "image/jpeg", ext: "jpg", ...jpegSize(data) };
  }
  if (recType === BLIP_TIFF) {
    return { mime: "image/tiff", ext: "tif" };
  }
  if (recType === BLIP_DIB) {
    return { mime: "image/bmp", ext: "bmp" };
  }
  return null;
}

export function countPptSlides(buffer) {
  const cfb = CFB.parse(buffer);
  const doc = findStream(cfb, "PowerPoint Document");
  if (!doc) {
    return 0;
  }
  let count = 0;
  walkRecords(doc, (rec) => {
    if (rec.recType === RT_SLIDE) {
      count += 1;
    }
  });
  return count;
}

export function extractEmbeddedImages(buffer) {
  const cfb = CFB.parse(buffer);
  const pictures = findStream(cfb, "Pictures");
  if (!pictures) {
    return [];
  }

  const images = [];
  walkRecords(pictures, (rec) => {
    const meta = describeBlip(rec.recType, pictures.subarray(rec.dataStart, rec.dataStart + rec.recLen));
    if (!meta) {
      return;
    }
    const data = blipPayload(pictures, rec);
    if (!data || data.length === 0) {
      return;
    }
    const sized = describeBlip(rec.recType, data) || meta;
    images.push({
      buffer: Buffer.from(data),
      mime: sized.mime,
      ext: sized.ext,
      width: sized.width || null,
      height: sized.height || null,
    });
  });
  return images;
}

function containBox(imgW, imgH, boxW, boxH) {
  if (!imgW || !imgH) {
    return { x: 0, y: 0, w: boxW, h: boxH };
  }
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return {
    x: (boxW - w) / 2,
    y: (boxH - h) / 2,
    w,
    h,
  };
}

/**
 * Last-resort conversion: one slide per embedded image.
 *
 * This loses text, shape placement and any image reused across slides, so it
 * only runs when the real converter cannot read the file.
 */
export async function convertLegacyPptViaImages(buffer) {
  const images = extractEmbeddedImages(buffer);
  if (images.length === 0) {
    throw new Error("이 .ppt 파일에서 슬라이드 이미지를 찾지 못했습니다.");
  }

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  for (const image of images) {
    const slide = pptx.addSlide();
    const box = containBox(image.width, image.height, WIDE.width, WIDE.height);
    slide.addImage({
      data: `data:${image.mime};base64,${image.buffer.toString("base64")}`,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
    });
  }
  return pptx.write({ outputType: "nodebuffer" });
}

function toArrayBuffer(buffer) {
  const buf = toBuffer(buffer);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}

/**
 * Converts a PowerPoint 97-2003 .ppt into .pptx, keeping slide order, text,
 * shape geometry and images reused across slides (hymn refrains repeat the
 * same score image, so slide count must come from the slide records rather
 * than from the picture stream).
 */
export async function convertLegacyPptToPptx(buffer) {
  try {
    const ole = parseOle2(toArrayBuffer(buffer));
    if (!isLegacyPpt(ole)) {
      throw new Error("PowerPoint 97-2003 형식이 아닙니다.");
    }
    return Buffer.from(await convertPptToPptx(ole));
  } catch (error) {
    const fallback = await convertLegacyPptViaImages(buffer);
    console.warn(
      `.ppt 정식 변환에 실패해 이미지 추출 방식으로 대체했습니다 (텍스트/반복 슬라이드 손실): ${error.message}`
    );
    return fallback;
  }
}
