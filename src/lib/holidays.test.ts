import { describe, expect, it } from "vitest";
import {
  countingDaysBack,
  holidayName,
  holidaysForYear,
  isHoliday,
  lastCountingDay,
  onlySkippedBetween,
  pauseReason,
  skipEmptyHolidays,
  skipEmptyPauses,
} from "./holidays";

describe("US federal holidays", () => {
  it("computes the eleven federal holidays for a year", () => {
    const names = holidaysForYear(2026)
      .filter((h) => !h.observed)
      .map((h) => h.name);
    expect(names).toHaveLength(11);
  });

  it("places the floating holidays on the right weekday", () => {
    expect(holidayName("2026-01-19")).toBe("Martin Luther King Jr. Day");
    expect(holidayName("2026-02-16")).toBe("Presidents' Day");
    expect(holidayName("2026-05-25")).toBe("Memorial Day");
    expect(holidayName("2026-09-07")).toBe("Labor Day");
    expect(holidayName("2026-10-12")).toBe("Columbus Day");
    expect(holidayName("2026-11-26")).toBe("Thanksgiving Day");
  });

  it("places the fixed holidays on their date", () => {
    expect(holidayName("2026-01-01")).toBe("New Year's Day");
    expect(holidayName("2026-06-19")).toBe("Juneteenth");
    expect(holidayName("2026-07-04")).toBe("Independence Day");
    expect(holidayName("2026-11-11")).toBe("Veterans Day");
    expect(holidayName("2026-12-25")).toBe("Christmas Day");
  });

  it("observes a Saturday holiday on the Friday before", () => {
    // 4 July 2026 is a Saturday.
    expect(holidayName("2026-07-03")).toBe("Independence Day (observed)");
  });

  it("observes a Sunday holiday on the Monday after", () => {
    // 4 July 2027 is a Sunday.
    expect(holidayName("2027-07-05")).toBe("Independence Day (observed)");
  });

  it("keeps New Year's observed in the December it falls in", () => {
    // 1 Jan 2028 is a Saturday, so the day off is Friday 31 Dec 2027.
    expect(holidayName("2027-12-31")).toBe("New Year's Day (observed)");
  });

  it("leaves ordinary days alone", () => {
    expect(isHoliday("2026-07-06")).toBe(false);
    expect(holidayName("2026-03-17")).toBeNull();
  });
});

describe("skipping empty holidays", () => {
  const skip = skipEmptyHolidays((date) => date === "2026-11-26");

  it("skips a holiday with nothing logged", () => {
    expect(skip("2026-12-25")).toBe(true);
  });

  it("keeps a holiday you worked", () => {
    expect(skip("2026-11-26")).toBe(false);
  });

  it("never skips an ordinary day", () => {
    expect(skip("2026-12-24")).toBe(false);
  });
});

describe("walking over skipped days", () => {
  const skip = skipEmptyHolidays(() => false);

  it("lastCountingDay steps back off a holiday", () => {
    // Christmas 2026 is a Friday, so the last day that counted is the 24th.
    expect(lastCountingDay("2026-12-25", skip)).toBe("2026-12-24");
  });

  it("lastCountingDay leaves an ordinary day alone", () => {
    expect(lastCountingDay("2026-12-24", skip)).toBe("2026-12-24");
  });

  it("countingDaysBack extends the window past a holiday", () => {
    // Thanksgiving 2026 is the 26th; a 3-day window ending the 27th reaches
    // back to the 24th rather than eating a slot on the holiday.
    expect(countingDaysBack("2026-11-27", 3, skip)).toEqual([
      "2026-11-27",
      "2026-11-25",
      "2026-11-24",
    ]);
  });

  it("countingDaysBack is a plain window when nothing is skipped", () => {
    expect(countingDaysBack("2026-03-05", 3, skip)).toEqual([
      "2026-03-05",
      "2026-03-04",
      "2026-03-03",
    ]);
  });

  it("onlySkippedBetween bridges a gap made only of holidays", () => {
    expect(onlySkippedBetween("2026-12-24", "2026-12-28", skip)).toBe(false);
    // 25 Dec 2026 is the only day between the 24th and the 26th.
    expect(onlySkippedBetween("2026-12-24", "2026-12-26", skip)).toBe(true);
  });

  it("onlySkippedBetween is false across an ordinary missed day", () => {
    expect(onlySkippedBetween("2026-03-03", "2026-03-05", skip)).toBe(false);
  });
});

describe("hand-marked days off", () => {
  const daysOff = new Map([
    ["2026-09-02", "Sick"],
    ["2026-09-03", null],
  ]);

  it("names the reason a stat stands down", () => {
    expect(pauseReason("2026-09-02", daysOff, false)).toBe("Sick");
  });

  it("falls back to a plain label with no reason typed", () => {
    expect(pauseReason("2026-09-03", daysOff, false)).toBe("Day off");
  });

  it("only reports the holiday when the stat ignores holidays", () => {
    expect(pauseReason("2026-11-26", daysOff, true)).toBe("Thanksgiving Day");
    expect(pauseReason("2026-11-26", daysOff, false)).toBeNull();
  });

  it("lets a day off win over the holiday it lands on", () => {
    const onHoliday = new Map([["2026-11-26", "Sick"]]);
    expect(pauseReason("2026-11-26", onHoliday, true)).toBe("Sick");
  });

  it("skips an empty day off but keeps one you worked", () => {
    const worked = skipEmptyPauses((d) => d === "2026-09-03", daysOff, false);
    expect(worked("2026-09-02")).toBe(true);
    expect(worked("2026-09-03")).toBe(false);
    expect(worked("2026-09-04")).toBe(false);
  });
});
