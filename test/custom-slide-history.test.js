import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeCustomSlide } from "../public/custom-slide-model.js";
import { createCustomSlideHistory } from "../public/custom-slide-history.js";

function slideWithText(text, zIndex = 0) {
  return normalizeCustomSlide({
    elements: [
      {
        id: `el-${text}`,
        type: "text",
        x: 10,
        y: 10,
        width: 200,
        height: 40,
        zIndex,
        text,
      },
    ],
  });
}

describe("createCustomSlideHistory", () => {
  it("starts from a normalized deep-cloned initial state", () => {
    const initial = slideWithText("start");
    const history = createCustomSlideHistory(initial);

    assert.deepEqual(history.current(), initial);
    assert.equal(history.canUndo(), false);
    assert.equal(history.canRedo(), false);
    assert.equal(history.isDirty(), false);

    initial.elements[0].text = "mutated";
    assert.equal(history.current().elements[0].text, "start");
  });

  it("tracks undo and redo with deep-cloned snapshots", () => {
    const history = createCustomSlideHistory(slideWithText("a"));
    const first = slideWithText("b");
    const second = slideWithText("c");

    history.push(first);
    history.push(second);

    assert.deepEqual(history.current(), second);
    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), false);

    const undone = history.undo();
    assert.deepEqual(undone, first);
    assert.deepEqual(history.current(), first);
    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), true);

    const redone = history.redo();
    assert.deepEqual(redone, second);
    assert.deepEqual(history.current(), second);
  });

  it("avoids duplicate consecutive snapshots", () => {
    const history = createCustomSlideHistory(slideWithText("a"));
    const same = slideWithText("a");

    history.push(same);
    assert.equal(history.canUndo(), false);

    history.push(slideWithText("b"));
    history.push(slideWithText("b"));
    assert.equal(history.canUndo(), true);
    history.undo();
    assert.deepEqual(history.current(), slideWithText("a"));
  });

  it("clears redo when pushing after undo", () => {
    const history = createCustomSlideHistory(slideWithText("a"));
    history.push(slideWithText("b"));
    history.undo();

    history.push(slideWithText("c"));
    assert.equal(history.canRedo(), false);
    assert.deepEqual(history.current(), slideWithText("c"));
  });

  it("marks saved baseline and compares dirty state using normalized snapshots", () => {
    const history = createCustomSlideHistory(slideWithText("saved"));
    history.markSaved();
    assert.equal(history.isDirty(), false);

    history.push(slideWithText("changed"));
    assert.equal(history.isDirty(), true);

    history.markSaved();
    assert.equal(history.isDirty(), false);

    history.push(
      normalizeCustomSlide({
        elements: [
          {
            id: "el-changed",
            type: "text",
            x: 10,
            y: 10,
            width: 200,
            height: 40,
            zIndex: 0,
            text: "changed",
            extra: "ignored",
          },
        ],
      })
    );
    assert.equal(history.isDirty(), false);
  });

  it("normalizes before deep cloning so undefined and Infinity do not throw", () => {
    const history = createCustomSlideHistory(
      normalizeCustomSlide({
        elements: [
          {
            id: "el-a",
            type: "text",
            x: 0,
            y: 0,
            width: 100,
            height: 40,
            text: "a",
          },
        ],
      })
    );

    assert.doesNotThrow(() => {
      history.push({
        elements: [
          {
            id: "el-b",
            type: "text",
            x: undefined,
            y: 0,
            width: Number.POSITIVE_INFINITY,
            height: 40,
            text: "b",
          },
        ],
      });
    });

    assert.deepEqual(history.current().elements[0].text, "b");
    assert.equal(history.current().elements[0].width, 1280);
  });

  it("reset reseeds the baseline and clears undo and redo", () => {
    const history = createCustomSlideHistory(slideWithText("a"));
    history.push(slideWithText("b"));
    history.undo();
    assert.equal(history.canUndo(), false);
    assert.equal(history.canRedo(), true);

    const fresh = slideWithText("fresh");
    history.reset(fresh);

    assert.deepEqual(history.current(), fresh);
    assert.equal(history.canUndo(), false);
    assert.equal(history.canRedo(), false);
    assert.equal(history.isDirty(), false);
  });

  it("reset can seed a dirty baseline when markSaved is false", () => {
    const history = createCustomSlideHistory(slideWithText("saved"));
    history.markSaved();

    history.reset(slideWithText("unsaved"), { markSaved: false });

    assert.deepEqual(history.current(), slideWithText("unsaved"));
    assert.equal(history.isDirty(), true);

    history.markSaved();
    assert.equal(history.isDirty(), false);
  });

  it("reset normalizes and deep clones the seeded state", () => {
    const history = createCustomSlideHistory(slideWithText("a"));
    const seed = {
      elements: [
        {
          id: "el-seed",
          type: "text",
          x: undefined,
          y: 0,
          width: Number.POSITIVE_INFINITY,
          height: 40,
          text: "seed",
        },
      ],
    };

    history.reset(seed);
    assert.equal(history.current().elements[0].width, 1280);

    seed.elements[0].text = "mutated";
    assert.equal(history.current().elements[0].text, "seed");
  });

  it("reset isolates later undo from snapshots pushed before it", () => {
    const history = createCustomSlideHistory(slideWithText("slide-1"));
    history.push(slideWithText("slide-1-edited"));

    history.reset(slideWithText("slide-2"));
    history.push(slideWithText("slide-2-edited"));

    assert.equal(history.canUndo(), true);
    assert.deepEqual(history.undo(), slideWithText("slide-2"));
    assert.equal(history.canUndo(), false);
  });

  it("returns snapshots that remain stable when mutated by callers", () => {
    const history = createCustomSlideHistory(slideWithText("stable"));
    const snapshot = history.current();

    snapshot.elements[0].text = "mutated";
    snapshot.width = 10;

    assert.equal(history.current().elements[0].text, "stable");
    assert.equal(history.current().width, 1280);

    history.push(slideWithText("next"));
    const undone = history.undo();
    undone.elements[0].text = "mutated again";
    assert.equal(history.current().elements[0].text, "stable");
  });
});
