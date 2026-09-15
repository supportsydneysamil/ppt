/**
 * Minimal stand-in for the Fabric.js browser module.
 *
 * The editor only needs a handful of Fabric behaviours (centered origins,
 * `calcLinePoints`, async image loading, canvas events). Real Fabric cannot run
 * in Node without the native `canvas` package because it measures text, so the
 * controller tests inject this module instead.
 */

let imageBehaviour = { width: 100, height: 50, delayMs: 0, fail: false };
let imageLoadCount = 0;

export function __setImageBehaviour(next = {}) {
  imageBehaviour = { width: 100, height: 50, delayMs: 0, fail: false, ...next };
}

export function __resetFakeFabric() {
  imageBehaviour = { width: 100, height: 50, delayMs: 0, fail: false };
  imageLoadCount = 0;
}

export function __imageLoadCount() {
  return imageLoadCount;
}

class FakeObject {
  constructor(options = {}) {
    Object.assign(
      this,
      {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        opacity: 1,
        originX: "left",
        originY: "top",
      },
      options
    );
    this.coordsUpdates = 0;
  }

  set(key, value) {
    if (typeof key === "string") {
      this[key] = value;
    } else {
      Object.assign(this, key);
    }
    return this;
  }

  get(key) {
    return this[key];
  }

  setCoords() {
    this.coordsUpdates += 1;
    return this;
  }

  rotate(angle) {
    this.angle = angle;
    return this;
  }

  // Every object the editor creates uses a centered origin, so left/top are the
  // center point already.
  getCenterPoint() {
    return { x: this.left, y: this.top };
  }
}

export class Rect extends FakeObject {}

export class Shadow {
  constructor(options = {}) {
    Object.assign(this, { color: "#000000", blur: 0, offsetX: 0, offsetY: 0, ...options });
  }
}

export class ActiveSelection extends FakeObject {
  constructor(objects = [], options = {}) {
    super({ type: "activeSelection", originX: "center", originY: "center", ...options });
    this._objects = [...objects];
    this.role = "selection";
    if (objects.length === 0) {
      this.left = 0;
      this.top = 0;
      return;
    }
    const lefts = objects.map((object) => object.left);
    const tops = objects.map((object) => object.top);
    this.left = (Math.min(...lefts) + Math.max(...lefts)) / 2;
    this.top = (Math.min(...tops) + Math.max(...tops)) / 2;
    for (const object of objects) {
      object.left -= this.left;
      object.top -= this.top;
    }
  }

  getObjects() {
    return [...this._objects];
  }

  restoreAbsolute() {
    for (const object of this._objects) {
      object.left += this.left;
      object.top += this.top;
    }
  }
}
export class Ellipse extends FakeObject {
  constructor(options = {}) {
    super(options);
    if (typeof this.rx === "number") {
      this.width = this.rx * 2;
    }
    if (typeof this.ry === "number") {
      this.height = this.ry * 2;
    }
  }
}

export class Textbox extends FakeObject {
  constructor(text, options = {}) {
    super({ fontSize: 40, ...options });
    this.text = text ?? "";
    this.recomputeHeight();
  }

  // Fabric derives Textbox height from wrapped text, never from a caller value.
  recomputeHeight() {
    const lines = String(this.text ?? "").split("\n").length;
    this.height = Math.round(lines * this.fontSize * 1.16 * 100) / 100;
  }

  set(key, value) {
    super.set(key, value);
    const changed = typeof key === "string" ? { [key]: value } : key;
    if ("text" in changed || "fontSize" in changed) {
      this.recomputeHeight();
    }
    return this;
  }
}

export class IText extends Textbox {}

export class Line extends FakeObject {
  constructor([x1, y1, x2, y2] = [0, 0, 0, 0], options = {}) {
    super(options);
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.width = Math.abs(x2 - x1);
    this.height = Math.abs(y2 - y1);
    this.left = Math.min(x1, x2) + this.width / 2;
    this.top = Math.min(y1, y2) + this.height / 2;
  }

  getCenterPoint() {
    return { x: this.left, y: this.top };
  }

  calcLinePoints() {
    const centerX = (this.x1 + this.x2) / 2;
    const centerY = (this.y1 + this.y2) / 2;
    return {
      x1: this.x1 - centerX,
      y1: this.y1 - centerY,
      x2: this.x2 - centerX,
      y2: this.y2 - centerY,
    };
  }
}

export class FabricImage extends FakeObject {
  static async fromURL(url) {
    imageLoadCount += 1;
    const { width, height, delayMs, fail } = imageBehaviour;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (fail) {
      throw new Error(`fake image load failed: ${url}`);
    }
    return new FabricImage({ width, height, src: url });
  }
}

function createContextStub() {
  const calls = [];
  const record = (name) => (...args) => {
    calls.push({ name, args });
  };
  return {
    calls,
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    setLineDash: record("setLineDash"),
  };
}

export class Canvas {
  constructor(element, options = {}) {
    Object.assign(this, options);
    this.lowerCanvasEl = element;
    this.disposed = false;
    this.disposeCount = 0;
    this.renderCount = 0;
    this.cssDimensions = null;
    this._objects = [];
    this._handlers = new Map();
    this._active = null;
    this._context = createContextStub();
  }

  getObjects() {
    return [...this._objects];
  }

  add(...objects) {
    this._objects.push(...objects.filter(Boolean));
    return this;
  }

  insertAt(index, ...objects) {
    this._objects.splice(index, 0, ...objects.filter(Boolean));
    return this;
  }

  remove(...objects) {
    for (const object of objects) {
      const index = this._objects.indexOf(object);
      if (index >= 0) {
        this._objects.splice(index, 1);
      }
    }
    return this;
  }

  setActiveObject(object) {
    this._active = object;
    return this;
  }

  getActiveObject() {
    return this._active;
  }

  discardActiveObject() {
    if (this._active instanceof ActiveSelection) {
      this._active.restoreAbsolute();
    }
    this._active = null;
    return this;
  }

  getActiveObjects() {
    if (this._active instanceof ActiveSelection) {
      return this._active.getObjects();
    }
    return this._active ? [this._active] : [];
  }

  bringObjectToFront(object) {
    const index = this._objects.indexOf(object);
    if (index >= 0) {
      this._objects.splice(index, 1);
      this._objects.push(object);
    }
    return this;
  }

  sendObjectToBack(object) {
    const index = this._objects.indexOf(object);
    if (index >= 0) {
      this._objects.splice(index, 1);
      this._objects.unshift(object);
    }
    return this;
  }

  requestRenderAll() {
    this.renderCount += 1;
    this.fire("after:render", {});
    return this;
  }

  renderAll() {
    return this.requestRenderAll();
  }

  getContext() {
    return this._context;
  }

  setDimensions(dimensions, options = {}) {
    this.cssDimensions = { ...dimensions, ...options };
    return this;
  }

  bringObjectForward(object) {
    const index = this._objects.indexOf(object);
    if (index >= 0 && index < this._objects.length - 1) {
      this._objects.splice(index, 1);
      this._objects.splice(index + 1, 0, object);
    }
    return this;
  }

  sendObjectBackwards(object) {
    const index = this._objects.indexOf(object);
    if (index > 0) {
      this._objects.splice(index, 1);
      this._objects.splice(index - 1, 0, object);
    }
    return this;
  }

  on(type, handler) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, []);
    }
    this._handlers.get(type).push(handler);
    return this;
  }

  off(type, handler) {
    const handlers = this._handlers.get(type) ?? [];
    const index = handlers.indexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
    }
    return this;
  }

  fire(type, payload) {
    for (const handler of [...(this._handlers.get(type) ?? [])]) {
      handler(payload);
    }
    return this;
  }

  handlerCount(type) {
    return (this._handlers.get(type) ?? []).length;
  }

  async dispose() {
    this.disposed = true;
    this.disposeCount += 1;
    this._handlers.clear();
    return true;
  }
}
