import { describe, expect, it } from "vitest";
import {
  addDays,
  describeDays,
  hoursOn,
  kitchenHoursOn,
  kitchenStatus,
  localNow,
  openStatus,
  specialsOn,
  upcomingEvents,
  utcOffset,
  weekdayOf,
} from "@/lib/schedule";
import { seedData } from "@/lib/seed";

const db = seedData(new Date("2026-10-29T17:00:00Z"));
const bar = db.bars[0];

describe("dates", () => {
  it("converts a UTC instant to the bar's local date and time", () => {
    // 03:30 UTC on Oct 30 is 22:30 on Oct 29 in Chicago (CDT, UTC-5).
    const now = localNow(new Date("2026-10-30T03:30:00Z"), "America/Chicago");
    expect(now).toEqual({ date: "2026-10-29", weekday: 4, minutes: 22 * 60 + 30 });
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(weekdayOf("2026-11-01")).toBe(0);
  });

  it("reports the UTC offset across daylight saving", () => {
    expect(utcOffset("2026-10-29", "America/Chicago")).toBe("-05:00");
    expect(utcOffset("2026-11-02", "America/Chicago")).toBe("-06:00");
  });
});

describe("openStatus", () => {
  it("is open during normal hours", () => {
    // Thursday 2026-10-29 opens 15:00, closes midnight.
    const status = openStatus(bar, [], { date: "2026-10-29", weekday: 4, minutes: 20 * 60 });
    expect(status).toEqual({ open: true, closesAt: "00:00" });
  });

  it("stays open after midnight on late nights", () => {
    // Saturday 01:30 is still Friday night's 11am-2am hours.
    const status = openStatus(bar, [], { date: "2026-10-31", weekday: 6, minutes: 90 });
    expect(status).toEqual({ open: true, closesAt: "02:00" });
  });

  it("names the next opening when closed", () => {
    const status = openStatus(bar, [], { date: "2026-10-29", weekday: 4, minutes: 10 * 60 });
    expect(status).toEqual({ open: false, opensAt: "15:00", opensOn: "2026-10-29" });
  });

  it("applies a holiday closure", () => {
    const closed = [
      { id: "o", barId: bar.id, date: "2026-11-26", closed: true, open: null, close: null, note: "Thanksgiving" },
    ];
    expect(hoursOn(bar, closed, "2026-11-26")).toBeNull();
    const status = openStatus(bar, closed, { date: "2026-11-26", weekday: 4, minutes: 16 * 60 });
    expect(status).toMatchObject({ open: false, opensOn: "2026-11-27" });
  });
});

describe("specials and events", () => {
  it("shows recurring specials only on their days", () => {
    const tuesday = specialsOn(db.specials, "2026-11-03").map((s) => s.title);
    expect(tuesday).toEqual(["Happy Hour", "Taco Tuesday"]);
    expect(specialsOn(db.specials, "2026-11-01")).toEqual([]);
  });

  it("lists today's and future events, soonest first", () => {
    const events = upcomingEvents(db.events, "2026-10-30");
    expect(events.map((e) => e.title)).toEqual(["The Rusty Nails (live)", "Pub Trivia", "Karaoke Night"]);
    expect(upcomingEvents(db.events, "2026-10-31").map((e) => e.title)).toEqual(["Pub Trivia", "Karaoke Night"]);
  });

  it("describes day sets in plain words", () => {
    expect(describeDays([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(describeDays([2])).toBe("Tuesday");
  });
});

describe("kitchen hours", () => {
  const pub78 = seedData(new Date("2026-10-29T17:00:00Z")).bars.find((b) => b.slug === "pub-78")!;

  it("closes the kitchen before the bar", () => {
    // Friday 2026-10-30: bar 4pm-1am, kitchen 4pm-9pm.
    expect(kitchenStatus(pub78, [], { date: "2026-10-30", weekday: 5, minutes: 20 * 60 })).toEqual({
      open: true,
      closesAt: "21:00",
    });
    const late = kitchenStatus(pub78, [], { date: "2026-10-30", weekday: 5, minutes: 22 * 60 });
    expect(late).toMatchObject({ open: false, opensOn: "2026-10-31", opensAt: "15:00" });
    expect(openStatus(pub78, [], { date: "2026-10-30", weekday: 5, minutes: 22 * 60 }).open).toBe(true);
  });

  it("is closed on days the bar is closed", () => {
    expect(kitchenHoursOn(pub78, [], "2026-11-02")).toBeNull(); // Monday
    const closed = [
      { id: "o", barId: pub78.id, date: "2026-11-26", closed: true, open: null, close: null, note: "" },
    ];
    expect(kitchenHoursOn(pub78, closed, "2026-11-26")).toBeNull();
  });

  it("follows bar hours when the bar has no separate kitchen hours", () => {
    expect(kitchenHoursOn(bar, [], "2026-10-30")).toEqual({ open: "11:00", close: "02:00" });
  });
});
