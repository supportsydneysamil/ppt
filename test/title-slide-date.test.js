import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatServiceDateEn,
  formatServiceDateKo,
  suggestSeasonLabel,
  upcomingSundays,
} from "../lib/title-slide-date.js";

describe("formatServiceDateKo", () => {
  it("renders a Korean Sunday label without zero padding", () => {
    assert.equal(formatServiceDateKo("2026-09-13"), "2026년 9월 13일 주일");
  });

  it("keeps the calendar date regardless of the host timezone", () => {
    assert.equal(formatServiceDateKo("2026-01-04"), "2026년 1월 4일 주일");
    assert.equal(formatServiceDateKo("2026-12-20"), "2026년 12월 20일 주일");
  });

  it("returns an empty string for unusable input", () => {
    assert.equal(formatServiceDateKo(""), "");
    assert.equal(formatServiceDateKo("nope"), "");
  });
});

describe("formatServiceDateEn", () => {
  it("renders an uppercase English date", () => {
    assert.equal(formatServiceDateEn("2026-09-13"), "SEPTEMBER 13, 2026");
    assert.equal(formatServiceDateEn("2027-01-03"), "JANUARY 3, 2027");
  });

  it("returns an empty string for unusable input", () => {
    assert.equal(formatServiceDateEn("2026-13-01"), "");
  });
});

describe("upcomingSundays", () => {
  it("includes the reference date when it is already a Sunday", () => {
    assert.deepEqual(upcomingSundays(3, "2026-09-13"), [
      "2026-09-13",
      "2026-09-20",
      "2026-09-27",
    ]);
  });

  it("starts from the next Sunday on a weekday", () => {
    assert.deepEqual(upcomingSundays(2, "2026-09-16"), [
      "2026-09-20",
      "2026-09-27",
    ]);
  });

  it("crosses month and year boundaries", () => {
    assert.deepEqual(upcomingSundays(3, "2026-12-20"), [
      "2026-12-20",
      "2026-12-27",
      "2027-01-03",
    ]);
  });
});

describe("suggestSeasonLabel", () => {
  it("detects the Easter cycle", () => {
    assert.equal(suggestSeasonLabel("2026-04-05"), "부활주일");
    assert.equal(suggestSeasonLabel("2026-03-29"), "종려주일");
    assert.equal(suggestSeasonLabel("2026-05-24"), "성령강림주일");
  });

  it("detects the third Sunday of November as the harvest service", () => {
    assert.equal(suggestSeasonLabel("2026-11-15"), "추수감사주일");
  });

  it("detects the Sunday closest before Christmas", () => {
    assert.equal(suggestSeasonLabel("2026-12-20"), "성탄주일");
    assert.equal(suggestSeasonLabel("2026-12-13"), "");
  });

  it("detects the first Sunday of the year", () => {
    assert.equal(suggestSeasonLabel("2027-01-03"), "신년 첫 주일");
  });

  it("returns an empty string for an ordinary Sunday", () => {
    assert.equal(suggestSeasonLabel("2026-09-13"), "");
    assert.equal(suggestSeasonLabel(""), "");
  });
});
