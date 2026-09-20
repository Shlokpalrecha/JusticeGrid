import { describe, expect, it } from "vitest";
import { daysBetween, isWithinDays, normalizeDateString, toKolkataDateString } from "../date.js";

describe("toKolkataDateString", () => {
  it("keeps the same calendar date when UTC time hasn't crossed into the next Kolkata day", () => {
    // 10:00 UTC + 5:30 = 15:30 same day in Kolkata.
    expect(toKolkataDateString(new Date("2026-09-20T10:00:00.000Z"))).toBe("2026-09-20");
  });

  it("rolls over to the next calendar date once the +5:30 shift crosses midnight", () => {
    // 20:00 UTC + 5:30 = 01:30 the next day in Kolkata.
    expect(toKolkataDateString(new Date("2026-09-20T20:00:00.000Z"))).toBe("2026-09-21");
  });

  it("is exact at the boundary: 18:29:59 UTC is still the same day, 18:30:00 UTC rolls over", () => {
    expect(toKolkataDateString(new Date("2026-09-20T18:29:59.999Z"))).toBe("2026-09-20");
    expect(toKolkataDateString(new Date("2026-09-20T18:30:00.000Z"))).toBe("2026-09-21");
  });

  it("does not depend on the host machine's local timezone (uses UTC getters throughout)", () => {
    // Regression guard: an implementation using getFullYear()/getMonth()/
    // getDate() instead of the UTC variants would give a different answer
    // depending on TZ, breaking determinism across machines/CI. This
    // doesn't change behaviour by itself, but locks in a date far enough
    // from any DST edge case in the *test runner's* zone that a
    // regression would be caught by the two tests above already.
    expect(toKolkataDateString(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
  });
});

describe("normalizeDateString", () => {
  it("returns a bare YYYY-MM-DD date unchanged", () => {
    expect(normalizeDateString("2026-09-20")).toBe("2026-09-20");
  });

  it("converts a full ISO datetime to its Asia/Kolkata calendar date", () => {
    expect(normalizeDateString("2026-09-20T20:00:00.000Z")).toBe("2026-09-21");
  });
});

describe("daysBetween", () => {
  it("is 0 for the same date", () => {
    expect(daysBetween("2026-09-20", "2026-09-20")).toBe(0);
  });

  it("is positive when `to` is later, negative when earlier", () => {
    expect(daysBetween("2026-09-20", "2026-09-23")).toBe(3);
    expect(daysBetween("2026-09-23", "2026-09-20")).toBe(-3);
  });

  it("counts correctly across a month boundary", () => {
    expect(daysBetween("2026-09-28", "2026-10-02")).toBe(4);
  });

  it("normalizes full ISO datetime inputs before comparing", () => {
    expect(daysBetween("2026-09-20T00:00:00.000Z", "2026-09-23T00:00:00.000Z")).toBe(3);
  });
});

describe("isWithinDays", () => {
  it("is true at exactly 0 days (today) and exactly the boundary day, inclusive", () => {
    expect(isWithinDays("2026-09-20", "2026-09-20", 3)).toBe(true);
    expect(isWithinDays("2026-09-20", "2026-09-23", 3)).toBe(true);
  });

  it("is false one day past the boundary", () => {
    expect(isWithinDays("2026-09-20", "2026-09-24", 3)).toBe(false);
  });

  it("is false for a date in the past", () => {
    expect(isWithinDays("2026-09-20", "2026-09-19", 3)).toBe(false);
  });
});
