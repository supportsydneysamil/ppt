import CFB from "cfb";
import PptxGenJS from "pptxgenjs";
import { convertPptToPptx, isLegacyPpt, parseOle2 } from "pptx-viewer-core";

import { applyPictureBackgrounds } from "./legacy-ppt-background.js";

const BLIP_JPEG = 0xf01d;
const BLIP_PNG = 0xf01e;
const BLIP_DIB = 0xf01f;
const BLIP_TIFF = 0xf029;
const BLIP_JPEG_ALT = 0xf02a;
const RT_DOCUMENT = 0x03e8;
const RT_SLIDE = 0x03ee;
const RT_SLIDE_PERSIST_ATOM = 0x03f3;
const RT_MAIN_MASTER = 0x03f8;
const RT_SLIDE_LIST_WITH_TEXT = 0x0ff0;
const RT_USER_EDIT_ATOM = 0x0ff5;
const RT_PERSIST_DIRECTORY_ATOM = 0x1772;

const ESCHER_BSTORE_CONTAINER = 0xf001;
const ESCHER_SP_CONTAINER = 0xf004;
const ESCHER_BSE = 0xf007;
const ESCHER_FSP = 0xf00a;
const ESCHER_FOPT = 0xf00b;
const CONTAINER_REC_VER = 0x0f;

const FSP_BACKGROUND = 0x400;
const BSE_FO_DELAY = 28;
const OPT_FILL_TYPE = 384;
const OPT_FILL_BLIP = 390;
const FILL_TEXTURE = 2;
const FILL_PICTURE = 3;

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
    const recVer = verInst & 0x0f;
    const recInstance = verInst >> 4;
    const recType = buf.readUInt16LE(offset + 2);
    const recLen = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (dataStart + recLen > buf.length) {
      break;
    }
    onRecord({ recVer, recInstance, recType, recLen, dataStart, headerStart: offset });
    offset = dataStart + recLen;
  }
}

/** Same walk, but descending into container records. */
function walkRecordTree(buf, onRecord) {
  walkRecords(buf, (rec) => {
    const body = buf.subarray(rec.dataStart, rec.dataStart + rec.recLen);
    onRecord(rec, body);
    if (rec.recVer === CONTAINER_REC_VER) {
      walkRecordTree(body, onRecord);
    }
  });
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

function readPicture(pictures, rec) {
  const meta = describeBlip(rec.recType, pictures.subarray(rec.dataStart, rec.dataStart + rec.recLen));
  if (!meta) {
    return null;
  }
  const data = blipPayload(pictures, rec);
  if (!data || data.length === 0) {
    return null;
  }
  const sized = describeBlip(rec.recType, data) || meta;
  return {
    buffer: Buffer.from(data),
    mime: sized.mime,
    ext: sized.ext,
    width: sized.width || null,
    height: sized.height || null,
  };
}

export function extractEmbeddedImages(buffer) {
  const cfb = CFB.parse(buffer);
  const pictures = findStream(cfb, "Pictures");
  if (!pictures) {
    return [];
  }

  const images = [];
  walkRecords(pictures, (rec) => {
    const image = readPicture(pictures, rec);
    if (image) {
      images.push(image);
    }
  });
  return images;
}

/** Picture-store images keyed by the 1-based blip index that shape fills use. */
function imagesByBlipIndex(doc, pictures) {
  const byOffset = new Map();
  walkRecords(pictures, (rec) => {
    const image = readPicture(pictures, rec);
    if (image) {
      byOffset.set(rec.headerStart, image);
    }
  });

  const images = new Map();
  let blipIndex = 0;
  walkRecordTree(doc, (rec, body) => {
    if (rec.recType !== ESCHER_BSTORE_CONTAINER) {
      return;
    }
    walkRecords(body, (bse) => {
      if (bse.recType !== ESCHER_BSE || bse.recLen < BSE_FO_DELAY + 4) {
        return;
      }
      blipIndex += 1;
      const image = byOffset.get(body.readUInt32LE(bse.dataStart + BSE_FO_DELAY));
      if (image) {
        images.set(blipIndex, image);
      }
    });
  });
  return images;
}

function shapeProperties(body, count) {
  const props = new Map();
  for (let i = 0; i < count && (i + 1) * 6 <= body.length; i += 1) {
    const offset = i * 6;
    props.set(body.readUInt16LE(offset) & 0x3fff, body.readUInt32LE(offset + 2));
  }
  return props;
}

/**
 * The image fill of a slide's or master's background shape, if it has one.
 *
 * PowerPoint keeps the background in a shape flagged FSP_BACKGROUND whose fill
 * points into the picture store. pptx-viewer-core reads only that shape's solid
 * colour, so an image background otherwise converts to flat white.
 */
function backgroundFill(container) {
  let fill = null;
  walkRecordTree(container, (rec, body) => {
    if (fill || rec.recType !== ESCHER_SP_CONTAINER) {
      return;
    }
    let isBackground = false;
    let props = null;
    walkRecords(body, (child) => {
      const childBody = body.subarray(child.dataStart, child.dataStart + child.recLen);
      if (child.recType === ESCHER_FSP && child.recLen >= 8) {
        isBackground = (childBody.readUInt32LE(4) & FSP_BACKGROUND) !== 0;
      } else if (child.recType === ESCHER_FOPT) {
        props = shapeProperties(childBody, child.recInstance);
      }
    });
    if (!isBackground || !props) {
      return;
    }
    const fillType = props.get(OPT_FILL_TYPE);
    const blipIndex = props.get(OPT_FILL_BLIP);
    if (blipIndex && (fillType === FILL_PICTURE || fillType === FILL_TEXTURE)) {
      fill = { blipIndex, tile: fillType === FILL_TEXTURE };
    }
  });
  return fill;
}

function recordAt(doc, offset) {
  if (offset === undefined || offset + 8 > doc.length) {
    return null;
  }
  const recLen = doc.readUInt32LE(offset + 4);
  const dataStart = offset + 8;
  if (dataStart + recLen > doc.length) {
    return null;
  }
  return {
    recType: doc.readUInt16LE(offset + 2),
    body: doc.subarray(dataStart, dataStart + recLen),
  };
}

function readUserEditChain(doc, startOffset) {
  const edits = [];
  const seen = new Set();
  let offset = startOffset;
  while (offset !== 0 && offset + 28 <= doc.length && !seen.has(offset)) {
    seen.add(offset);
    if (doc.readUInt16LE(offset + 2) !== RT_USER_EDIT_ATOM || doc.readUInt32LE(offset + 4) < 20) {
      break;
    }
    const data = offset + 8;
    edits.push({
      offsetPersistDirectory: doc.readUInt32LE(data + 12),
      docPersistIdRef: doc.readUInt32LE(data + 16),
    });
    offset = doc.readUInt32LE(data + 8);
  }
  return edits;
}

function readPersistDirectoryAtom(doc, offset, directory) {
  if (offset + 8 > doc.length || doc.readUInt16LE(offset + 2) !== RT_PERSIST_DIRECTORY_ATOM) {
    return;
  }
  const end = Math.min(offset + 8 + doc.readUInt32LE(offset + 4), doc.length);
  let cursor = offset + 8;
  while (cursor + 4 <= end) {
    const header = doc.readUInt32LE(cursor);
    cursor += 4;
    const firstId = header & 0xfffff;
    const count = header >>> 20;
    for (let i = 0; i < count && cursor + 4 <= end; i += 1) {
      directory.set(firstId + i, doc.readUInt32LE(cursor));
      cursor += 4;
    }
  }
}

/**
 * Maps persist ids to record offsets. Incremental saves leave a chain of edits,
 * and later ones win, so the oldest directory is applied first.
 */
function persistDirectory(cfb, doc) {
  const currentUser = findStream(cfb, "Current User");
  const startOffset = currentUser && currentUser.length >= 20 ? currentUser.readUInt32LE(16) : 0;
  const edits = readUserEditChain(doc, startOffset);
  const directory = new Map();
  for (let i = edits.length - 1; i >= 0; i -= 1) {
    readPersistDirectoryAtom(doc, edits[i].offsetPersistDirectory, directory);
  }
  return { directory, docPersistIdRef: edits[0]?.docPersistIdRef };
}

/** Persist ids listed by the document's SlideListWithText of the given instance. */
function listedPersistIds(documentContainer, instance) {
  const ids = [];
  walkRecords(documentContainer, (rec) => {
    if (rec.recType !== RT_SLIDE_LIST_WITH_TEXT || rec.recInstance !== instance || ids.length) {
      return;
    }
    const list = documentContainer.subarray(rec.dataStart, rec.dataStart + rec.recLen);
    walkRecords(list, (child) => {
      if (child.recType === RT_SLIDE_PERSIST_ATOM && child.recLen >= 4) {
        ids.push(list.readUInt32LE(child.dataStart));
      }
    });
  });
  return ids;
}

/**
 * Slide containers in presentation order, which lives in the document's slide
 * list rather than in the byte order of the slide records. The converter walks
 * the same list, so indexes here match the slides it emits.
 */
function slideContainers(doc, directory, documentContainer) {
  let persistIds = documentContainer ? listedPersistIds(documentContainer, 0) : [];
  if (persistIds.length === 0) {
    persistIds = [...directory]
      .filter(([, offset]) => recordAt(doc, offset)?.recType === RT_SLIDE)
      .map(([id]) => id)
      .sort((a, b) => a - b);
  }
  return persistIds
    .map((id) => recordAt(doc, directory.get(id)))
    .filter((record) => record?.recType === RT_SLIDE)
    .map((record) => record.body);
}

function masterContainer(doc, directory, documentContainer) {
  const [masterId] = documentContainer ? listedPersistIds(documentContainer, 1) : [];
  const master = recordAt(doc, directory.get(masterId));
  return master?.recType === RT_MAIN_MASTER ? master.body : null;
}

/**
 * Image backgrounds the converter cannot represent: the master's, plus any slide
 * that overrides it, keyed by that slide's index in the converted deck.
 */
function readPictureBackgrounds(buffer) {
  const cfb = CFB.parse(buffer);
  const doc = findStream(cfb, "PowerPoint Document");
  const pictures = findStream(cfb, "Pictures");
  if (!doc || !pictures) {
    return { master: null, slides: new Map() };
  }

  const { directory, docPersistIdRef } = persistDirectory(cfb, doc);
  const documentRecord = recordAt(doc, directory.get(docPersistIdRef));
  const documentContainer = documentRecord?.recType === RT_DOCUMENT ? documentRecord.body : null;
  const images = imagesByBlipIndex(doc, pictures);

  const resolve = (container) => {
    const fill = container && backgroundFill(container);
    const image = fill && images.get(fill.blipIndex);
    return image ? { image, tile: fill.tile } : null;
  };

  const slides = new Map();
  slideContainers(doc, directory, documentContainer).forEach((container, index) => {
    const background = resolve(container);
    if (background) {
      slides.set(index, background);
    }
  });
  return { master: resolve(masterContainer(doc, directory, documentContainer)), slides };
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

/** A lost background must not cost us the whole conversion. */
function restorePictureBackgrounds(converted, source) {
  try {
    return applyPictureBackgrounds(converted, readPictureBackgrounds(source));
  } catch (error) {
    console.warn(`.ppt 배경 이미지를 복원하지 못했습니다: ${error.message}`);
    return converted;
  }
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
    const converted = Buffer.from(await convertPptToPptx(ole));
    return restorePictureBackgrounds(converted, buffer);
  } catch (error) {
    const fallback = await convertLegacyPptViaImages(buffer);
    console.warn(
      `.ppt 정식 변환에 실패해 이미지 추출 방식으로 대체했습니다 (텍스트/반복 슬라이드 손실): ${error.message}`
    );
    return fallback;
  }
}
