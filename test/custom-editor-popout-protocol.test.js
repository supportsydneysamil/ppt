import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clearRecovery,
  createPopoutEnvelope,
  createPopoutSequence,
  readRecovery,
  validatePopoutEnvelope,
  writeRecovery,
} from "../public/custom-editor-popout-protocol.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("custom editor popout protocol", () => {
  it("validates session, slide, version, type, and sequence", () => {
    const message = createPopoutEnvelope({
      sessionId: "session-a",
      slideId: "slide-a",
      sequence: 1,
      type: "READY",
      payload: { ok: true },
    });
    assert.equal(
      validatePopoutEnvelope(message, {
        sessionId: "session-a",
        slideId: "slide-a",
      }).valid,
      true
    );
    assert.equal(
      validatePopoutEnvelope(message, { sessionId: "other" }).reason,
      "session"
    );
    assert.equal(
      validatePopoutEnvelope({ ...message, type: "UNKNOWN" }).reason,
      "type"
    );
  });

  it("deep clones payloads and rejects stale incoming messages", () => {
    const sequence = createPopoutSequence({
      sessionId: "session-a",
      slideId: "slide-a",
    });
    const payload = { model: { elements: [] } };
    const outgoing = sequence.next("EDITOR_CHANGED", payload);
    payload.model.elements.push({ id: "late" });
    assert.deepEqual(outgoing.payload.model.elements, []);

    assert.equal(sequence.accept(outgoing).valid, true);
    assert.equal(sequence.accept(outgoing).reason, "stale");
  });

  it("writes, expires, and clears recovery records", () => {
    const storage = memoryStorage();
    writeRecovery(storage, "session-a", { slideId: "slide-a" }, 1000);
    assert.deepEqual(readRecovery(storage, "session-a", 2000), {
      slideId: "slide-a",
    });
    assert.equal(readRecovery(storage, "session-a", 86_402_000), null);

    writeRecovery(storage, "session-a", { slideId: "slide-a" }, 1000);
    clearRecovery(storage, "session-a");
    assert.equal(readRecovery(storage, "session-a", 2000), null);
  });

  it("treats unavailable storage as an empty recovery store", () => {
    const storage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    assert.equal(writeRecovery(storage, "x", {}, 0), false);
    assert.equal(readRecovery(storage, "x", 0), null);
    assert.equal(clearRecovery(storage, "x"), false);
  });
});
