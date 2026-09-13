import { normalizeCustomSlide } from "./custom-slide-model.js";

function cloneSnapshot(state) {
  return normalizeCustomSlide(state);
}

function snapshotKey(state) {
  return JSON.stringify(normalizeCustomSlide(state));
}

export function createCustomSlideHistory(initialState) {
  const initialSnapshot = cloneSnapshot(initialState);
  let current = cloneSnapshot(initialSnapshot);
  const undoStack = [];
  const redoStack = [];
  let savedSnapshot = snapshotKey(initialSnapshot);

  return {
    push(state) {
      const next = cloneSnapshot(state);
      if (snapshotKey(next) === snapshotKey(current)) {
        return;
      }
      undoStack.push(cloneSnapshot(current));
      redoStack.length = 0;
      current = next;
    },

    undo() {
      if (undoStack.length === 0) {
        return cloneSnapshot(current);
      }
      redoStack.push(cloneSnapshot(current));
      current = undoStack.pop();
      return cloneSnapshot(current);
    },

    redo() {
      if (redoStack.length === 0) {
        return cloneSnapshot(current);
      }
      undoStack.push(cloneSnapshot(current));
      current = redoStack.pop();
      return cloneSnapshot(current);
    },

    current() {
      return cloneSnapshot(current);
    },

    canUndo() {
      return undoStack.length > 0;
    },

    canRedo() {
      return redoStack.length > 0;
    },

    // Reseeds the baseline so a newly loaded slide cannot be undone back into
    // the previous one.
    reset(state, { markSaved = true } = {}) {
      const next = cloneSnapshot(state);
      undoStack.length = 0;
      redoStack.length = 0;
      current = next;
      if (markSaved) {
        savedSnapshot = snapshotKey(next);
      }
      return cloneSnapshot(current);
    },

    markSaved() {
      savedSnapshot = snapshotKey(current);
    },

    isDirty() {
      return snapshotKey(current) !== savedSnapshot;
    },
  };
}
