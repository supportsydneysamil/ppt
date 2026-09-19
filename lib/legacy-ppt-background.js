import path from "node:path";
import AdmZip from "adm-zip";

const MASTER_PART = "ppt/slideMasters/slideMaster1.xml";
const CONTENT_TYPES_PART = "[Content_Types].xml";
const IMAGE_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const BACKGROUND_ELEMENT = /<p:bg>[\s\S]*?<\/p:bg>/;

const CONTENT_TYPE_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

function relsPartFor(part) {
  return part.replace(/([^/]+)$/, "_rels/$1.rels");
}

function addImageRelationship(zip, part, target) {
  const name = relsPartFor(part);
  const entry = zip.getEntry(name);
  const xml = entry
    ? zip.readAsText(name)
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n</Relationships>';
  const used = [...xml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  const id = `rId${Math.max(0, ...used) + 1}`;
  const relative = path.posix.relative(path.posix.dirname(part), target);
  const updated = xml.replace(
    /\s*<\/Relationships>/,
    `\n  <Relationship Id="${id}" Type="${IMAGE_REL_TYPE}" Target="${relative}"/>\n</Relationships>`
  );

  if (entry) {
    zip.updateFile(name, Buffer.from(updated));
  } else {
    zip.addFile(name, Buffer.from(updated));
  }
  return id;
}

function ensureImageContentType(zip, ext) {
  const xml = zip.readAsText(CONTENT_TYPES_PART);
  if (new RegExp(`<Default Extension="${ext}"`, "i").test(xml)) {
    return;
  }
  const contentType = CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
  zip.updateFile(
    CONTENT_TYPES_PART,
    Buffer.from(
      xml.replace(
        /(<Types[^>]*>)/,
        `$1\n  <Default Extension="${ext}" ContentType="${contentType}"/>`
      )
    )
  );
}

function backgroundXml(relId, tile) {
  const fillMode = tile ? "<a:tile/>" : "<a:stretch><a:fillRect/></a:stretch>";
  return `<p:bg><p:bgPr><a:blipFill rotWithShape="0"><a:blip r:embed="${relId}"/>${fillMode}</a:blipFill><a:effectLst/></p:bgPr></p:bg>`;
}

function writeBackground(zip, part, xml) {
  const current = zip.readAsText(part);
  const updated = BACKGROUND_ELEMENT.test(current)
    ? current.replace(BACKGROUND_ELEMENT, xml)
    : current.replace(/(<p:cSld[^>]*>)/, `$1${xml}`);
  zip.updateFile(part, Buffer.from(updated));
}

/**
 * Re-attaches the image backgrounds that the .ppt converter flattened to a flat
 * colour, replacing the solid fill it wrote with a blip fill on the same part.
 *
 * `backgrounds.slides` is keyed by slide index, so the caller has to read the
 * .ppt in presentation order for the images to land on the right slides.
 */
export function applyPictureBackgrounds(pptx, backgrounds) {
  if (!backgrounds.master && backgrounds.slides.size === 0) {
    return pptx;
  }

  const zip = new AdmZip(pptx);
  // A background reused across parts is one blip in the .ppt, so it stays one
  // media part here too.
  const mediaByImage = new Map();

  const apply = (part, background) => {
    let target = mediaByImage.get(background.image);
    if (!target) {
      target = `ppt/media/background${mediaByImage.size + 1}.${background.image.ext}`;
      zip.addFile(target, background.image.buffer);
      ensureImageContentType(zip, background.image.ext);
      mediaByImage.set(background.image, target);
    }
    const relId = addImageRelationship(zip, part, target);
    writeBackground(zip, part, backgroundXml(relId, background.tile));
  };

  if (backgrounds.master && zip.getEntry(MASTER_PART)) {
    apply(MASTER_PART, backgrounds.master);
  }
  for (const [index, background] of backgrounds.slides) {
    const part = `ppt/slides/slide${index + 1}.xml`;
    if (zip.getEntry(part)) {
      apply(part, background);
    }
  }
  return zip.toBuffer();
}
