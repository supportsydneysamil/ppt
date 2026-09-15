export const POPOUT_PROTOCOL_VERSION = 1;
export const POPOUT_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;

const MESSAGE_TYPES = new Set([
  "READY",
  "INITIALIZE_SESSION",
  "EDITOR_CHANGED",
  "SAVE_REQUEST",
  "SAVE_RESULT",
  "RESET_REQUEST",
  "RESET_RESULT",
  "CLOSE_REQUEST",
  "FINAL_SNAPSHOT",
  "FINAL_ACK",
  "CONNECTION_STATE",
]);

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function createPopoutEnvelope({
  sessionId,
  slideId,
  sequence,
  type,
  payload,
}) {
  return {
    protocolVersion: POPOUT_PROTOCOL_VERSION,
    sessionId: String(sessionId ?? ""),
    slideId: String(slideId ?? ""),
    sequence: Number(sequence) || 0,
    type,
    payload: clone(payload),
  };
}

export function validatePopoutEnvelope(message, expected = {}) {
  if (!message || typeof message !== "object") {
    return { valid: false, reason: "shape" };
  }
  if (message.protocolVersion !== POPOUT_PROTOCOL_VERSION) {
    return { valid: false, reason: "version" };
  }
  if (expected.sessionId && message.sessionId !== expected.sessionId) {
    return { valid: false, reason: "session" };
  }
  if (expected.slideId && message.slideId !== expected.slideId) {
    return { valid: false, reason: "slide" };
  }
  if (!Number.isInteger(message.sequence) || message.sequence < 1) {
    return { valid: false, reason: "sequence" };
  }
  if (!MESSAGE_TYPES.has(message.type)) {
    return { valid: false, reason: "type" };
  }
  return { valid: true, message };
}

export function createPopoutSequence({ sessionId, slideId } = {}) {
  let outgoing = 0;
  let incoming = 0;
  return {
    next(type, payload) {
      outgoing += 1;
      return createPopoutEnvelope({
        sessionId,
        slideId,
        sequence: outgoing,
        type,
        payload,
      });
    },
    accept(message) {
      const result = validatePopoutEnvelope(message, { sessionId, slideId });
      if (!result.valid) return result;
      if (message.sequence <= incoming) {
        return { valid: false, reason: "stale" };
      }
      incoming = message.sequence;
      return result;
    },
  };
}

function recoveryKey(sessionId) {
  return `samil-custom-editor-recovery:${sessionId}`;
}

export function writeRecovery(storage, sessionId, record, now = Date.now()) {
  try {
    storage.setItem(
      recoveryKey(sessionId),
      JSON.stringify({
        expiresAt: now + POPOUT_RECOVERY_TTL_MS,
        record: clone(record),
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function readRecovery(storage, sessionId, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(recoveryKey(sessionId)) || "null");
    if (!value || value.expiresAt <= now) {
      storage.removeItem(recoveryKey(sessionId));
      return null;
    }
    return clone(value.record);
  } catch {
    return null;
  }
}

export function clearRecovery(storage, sessionId) {
  try {
    storage.removeItem(recoveryKey(sessionId));
    return true;
  } catch {
    return false;
  }
}
