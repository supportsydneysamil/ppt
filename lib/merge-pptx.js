import AdmZip from "adm-zip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { Automizer } from "pptx-automizer";
import PptxGenJS from "pptxgenjs";

export const WIDE_EMU = { cx: 12192000, cy: 6858000 };

function parseSldSz(xml) {
  const match = xml.match(/<p:sldSz\b[^>]*>/);
  if (!match) {
    return null;
  }
  const cx = Number(/cx="(\d+)"/.exec(match[0])?.[1]);
  const cy = Number(/cy="(\d+)"/.exec(match[0])?.[1]);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || cx <= 0 || cy <= 0) {
    return null;
  }
  return { cx, cy };
}

function setAttr(el, name, value) {
  if (!el) {
    return;
  }
  el.setAttribute(name, String(Math.round(value)));
}

function scaleLength(value, scale) {
  return Math.round(Number(value) * scale);
}

function isTopLevelShape(node) {
  const parent = node.parentNode;
  if (!parent || parent.localName !== "spTree") {
    return false;
  }
  return ["sp", "pic", "cxnSp", "graphicFrame", "grpSp"].includes(node.localName);
}

function ownXfrm(shape) {
  if (shape.localName === "grpSp") {
    const grpSpPr = [...shape.childNodes].find((n) => n.localName === "grpSpPr");
    return grpSpPr ? [...grpSpPr.childNodes].find((n) => n.localName === "xfrm") : null;
  }
  if (shape.localName === "graphicFrame") {
    return [...shape.childNodes].find((n) => n.localName === "xfrm");
  }
  const spPr = [...shape.childNodes].find((n) => n.localName === "spPr");
  return spPr ? [...spPr.childNodes].find((n) => n.localName === "xfrm") : null;
}

function transformXfrm(xfrm, scale, ox, oy) {
  if (!xfrm) {
    return;
  }
  const off = [...xfrm.childNodes].find((n) => n.localName === "off");
  const ext = [...xfrm.childNodes].find((n) => n.localName === "ext");
  if (off) {
    setAttr(off, "x", scaleLength(off.getAttribute("x") || 0, scale) + ox);
    setAttr(off, "y", scaleLength(off.getAttribute("y") || 0, scale) + oy);
  }
  if (ext) {
    setAttr(ext, "cx", scaleLength(ext.getAttribute("cx") || 0, scale));
    setAttr(ext, "cy", scaleLength(ext.getAttribute("cy") || 0, scale));
  }
}

function scaleFonts(doc, scale) {
  if (scale === 1) {
    return;
  }
  const nodes = doc.getElementsByTagName("a:sz");
  for (let i = 0; i < nodes.length; i += 1) {
    const val = Number(nodes[i].getAttribute("val"));
    if (Number.isFinite(val) && val > 0) {
      nodes[i].setAttribute("val", String(Math.max(100, Math.round(val * scale))));
    }
  }
}

function fitSlideXml(xml, scale, ox, oy) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const tree = doc.getElementsByTagName("p:spTree")[0];
  if (tree) {
    [...tree.childNodes].forEach((child) => {
      if (child.nodeType === 1 && isTopLevelShape(child)) {
        transformXfrm(ownXfrm(child), scale, ox, oy);
      }
    });
  }
  scaleFonts(doc, scale);
  return new XMLSerializer().serializeToString(doc);
}

export function fitPptxToWidescreen(buffer) {
  const zip = new AdmZip(buffer);
  const presEntry = zip.getEntry("ppt/presentation.xml");
  if (!presEntry) {
    return buffer;
  }

  let presXml = presEntry.getData().toString("utf8");
  const size = parseSldSz(presXml);
  if (!size) {
    return buffer;
  }
  if (size.cx === WIDE_EMU.cx && size.cy === WIDE_EMU.cy) {
    return buffer;
  }

  const scale = Math.min(WIDE_EMU.cx / size.cx, WIDE_EMU.cy / size.cy);
  const ox = Math.round((WIDE_EMU.cx - size.cx * scale) / 2);
  const oy = Math.round((WIDE_EMU.cy - size.cy * scale) / 2);

  presXml = presXml.replace(
    /<p:sldSz\b[^>]*>/,
    `<p:sldSz cx="${WIDE_EMU.cx}" cy="${WIDE_EMU.cy}" type="screen16x9"/>`
  );
  zip.updateFile("ppt/presentation.xml", Buffer.from(presXml, "utf8"));

  zip.getEntries().forEach((entry) => {
    if (!/^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName)) {
      return;
    }
    const next = fitSlideXml(entry.getData().toString("utf8"), scale, ox, oy);
    zip.updateFile(entry.entryName, Buffer.from(next, "utf8"));
  });

  return zip.toBuffer();
}

async function emptyWideRoot() {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  return pptx.write({ outputType: "nodebuffer" });
}

export async function mergePptxBuffers(buffers) {
  const sources = buffers.filter((buf) => buf && buf.length);
  if (sources.length === 0) {
    throw new Error("합칠 슬라이드가 없습니다.");
  }

  const root = await emptyWideRoot();
  const automizer = new Automizer({
    removeExistingSlides: true,
    autoImportSlideMasters: true,
    cleanup: false,
    compression: 6,
  });

  const presentation = automizer.loadRoot(root);
  for (const [index, raw] of sources.entries()) {
    const alias = `source-${index}`;
    const fitted = fitPptxToWidescreen(raw);
    presentation.load(fitted, alias);
    const slideNumbers = await presentation.getTemplate(alias).getAllSlideNumbers();
    for (const slideNumber of slideNumbers) {
      presentation.addSlide(alias, slideNumber);
    }
  }

  const zip = await presentation.getJSZip();
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}
