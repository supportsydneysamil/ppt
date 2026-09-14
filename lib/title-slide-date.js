// Date helpers for the "타이틀" slide type. Every calculation runs in UTC so a
// stored `YYYY-MM-DD` renders as the same calendar day on the server and in the
// browser, whatever the host timezone is.

const DAY_MS = 24 * 60 * 60 * 1000;

const EN_MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

function parseIsoDate(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  const isRealDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return isRealDate ? date : null;
}

function toIsoDate(date) {
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function isSameDay(a, b) {
  return a.getTime() === b.getTime();
}

function nthSundayOfMonth(year, monthIndex, nth) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const offset = first.getUTCDay() === 0 ? 0 : 7 - first.getUTCDay();
  return addDays(first, offset + (nth - 1) * 7);
}

// Meeus/Jones/Butcher Gregorian algorithm.
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const dayOfYear = h + l - 7 * m + 114;

  return new Date(Date.UTC(year, Math.floor(dayOfYear / 31) - 1, (dayOfYear % 31) + 1));
}

export const DATE_MODES = ["custom", "today", "next-sunday"];

export function normalizeDateMode(value) {
  return DATE_MODES.includes(value) ? value : "custom";
}

export function resolveServiceDate(mode, storedIso, todayIso) {
  const today = todayIso || todayIsoDate();
  const normalized = normalizeDateMode(mode);
  if (normalized === "today") {
    return today;
  }
  if (normalized === "next-sunday") {
    return upcomingSundays(1, today)[0] || today;
  }
  const stored = typeof storedIso === "string" ? storedIso.trim() : "";
  return parseIsoDate(stored) ? stored : today;
}

/** Today's calendar date as `YYYY-MM-DD`, read from the local clock. */
export function todayIsoDate() {
  const now = new Date();
  return toIsoDate(
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  );
}

/** `2026-09-13` → `2026년 9월 13일 주일`. Empty string when unparsable. */
export function formatServiceDateKo(isoDate) {
  const date = parseIsoDate(isoDate);
  if (!date) {
    return "";
  }
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 주일`;
}

/** `2026-09-13` → `SEPTEMBER 13, 2026`. Empty string when unparsable. */
export function formatServiceDateEn(isoDate) {
  const date = parseIsoDate(isoDate);
  if (!date) {
    return "";
  }
  return `${EN_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/**
 * The next `count` Sundays as ISO dates, starting from `fromIso` (defaults to
 * today) and including it when it is already a Sunday.
 */
export function upcomingSundays(count, fromIso) {
  const base = parseIsoDate(fromIso ?? todayIsoDate());
  if (!base || !Number.isInteger(count) || count < 1) {
    return [];
  }

  const offset = base.getUTCDay() === 0 ? 0 : 7 - base.getUTCDay();
  const firstSunday = addDays(base, offset);

  return Array.from({ length: count }, (_, index) =>
    toIsoDate(addDays(firstSunday, index * 7))
  );
}

/**
 * Church-calendar label for a Sunday, or an empty string for an ordinary one.
 * Used to prefill the optional subtitle field.
 */
export function suggestSeasonLabel(isoDate) {
  const date = parseIsoDate(isoDate);
  if (!date) {
    return "";
  }

  const year = date.getUTCFullYear();
  const easter = easterSunday(year);

  if (isSameDay(date, easter)) {
    return "부활주일";
  }
  if (isSameDay(date, addDays(easter, -7))) {
    return "종려주일";
  }
  if (isSameDay(date, addDays(easter, 49))) {
    return "성령강림주일";
  }
  if (isSameDay(date, nthSundayOfMonth(year, 0, 1))) {
    return "신년 첫 주일";
  }
  if (isSameDay(date, nthSundayOfMonth(year, 10, 3))) {
    return "추수감사주일";
  }

  const isSunday = date.getUTCDay() === 0;
  const day = date.getUTCDate();
  if (isSunday && date.getUTCMonth() === 11 && day >= 19 && day <= 25) {
    return "성탄주일";
  }

  return "";
}
