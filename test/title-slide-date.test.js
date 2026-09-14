import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as titleSlideDate from "../lib/title-slide-date.js";
import {
  formatServiceDateEn,
  formatServiceDateKo,
  normalizeDateMode,
  resolveServiceDate,
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

describe("normalizeDateMode", () => {
  it("keeps known modes and falls back to custom", () => {
    assert.equal(normalizeDateMode("today"), "today");
    assert.equal(normalizeDateMode("next-sunday"), "next-sunday");
    assert.equal(normalizeDateMode("custom"), "custom");
    assert.equal(normalizeDateMode("nope"), "custom");
    assert.equal(normalizeDateMode(undefined), "custom");
  });
});

describe("resolveServiceDate", () => {
  it("uses stored date for custom, or today when stored is empty", () => {
    assert.equal(resolveServiceDate("custom", "2026-09-10", "2026-09-14"), "2026-09-10");
    assert.equal(resolveServiceDate("custom", "", "2026-09-14"), "2026-09-14");
  });

  it("uses the provided today for today mode", () => {
    assert.equal(resolveServiceDate("today", "2026-01-01", "2026-09-14"), "2026-09-14");
  });

  it("uses today when it is Sunday, otherwise the next Sunday", () => {
    assert.equal(resolveServiceDate("next-sunday", "", "2026-09-13"), "2026-09-13");
    assert.equal(resolveServiceDate("next-sunday", "", "2026-09-16"), "2026-09-20");
  });
});

describe("syncAutomaticServiceDate", () => {
  it("updates the slide record for automatic modes", () => {
    assert.equal(typeof titleSlideDate.syncAutomaticServiceDate, "function");
    const todaySlide = {
      dateMode: "today",
      serviceDate: "2026-01-01",
    };
    const sundaySlide = {
      dateMode: "next-sunday",
      serviceDate: "2026-01-04",
    };

    assert.equal(
      titleSlideDate.syncAutomaticServiceDate(todaySlide, "2026-09-14"),
      "2026-09-14"
    );
    assert.equal(todaySlide.serviceDate, "2026-09-14");
    assert.equal(
      titleSlideDate.syncAutomaticServiceDate(sundaySlide, "2026-09-14"),
      "2026-09-20"
    );
    assert.equal(sundaySlide.serviceDate, "2026-09-20");
  });

  it("returns the resolved custom date without changing its record", () => {
    const customSlide = {
      dateMode: "custom",
      serviceDate: "",
    };

    assert.equal(
      titleSlideDate.syncAutomaticServiceDate(customSlide, "2026-09-14"),
      "2026-09-14"
    );
    assert.equal(customSlide.serviceDate, "");
  });
});
