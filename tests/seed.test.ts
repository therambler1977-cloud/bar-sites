import { describe, expect, it } from "vitest";
import { seedData } from "../src/lib/seed";
import { upcomingEvents } from "../src/lib/schedule";

describe("Pub 78 weekly events", () => {
  const pub78 = (now: Date) => seedData(now).events.filter((e) => e.barId === "pub-78");

  it("lists Open Mic every Wednesday and Singo every Thursday from Nov 4", () => {
    const events = pub78(new Date("2026-11-04T18:00:00Z"));
    const openMic = events.filter((e) => e.title === "Open Mic/Jam with Alex Hamer" && e.date >= "2026-11-01");
    const singo = events.filter((e) => e.title === "Singo hosted by Katie Redmond" && e.date >= "2026-11-01");
    expect(openMic.slice(0, 3).map((e) => e.date)).toEqual(["2026-11-04", "2026-11-11", "2026-11-18"]);
    expect(singo.slice(0, 3).map((e) => e.date)).toEqual(["2026-11-05", "2026-11-12", "2026-11-19"]);
    expect(openMic[0]).toMatchObject({ startTime: "20:00", endTime: "23:00" });
    expect(singo[0]).toMatchObject({ startTime: "19:00", endTime: "22:00" });
  });

  it("keeps the calendar filled weeks later", () => {
    const events = pub78(new Date("2027-02-01T18:00:00Z"));
    expect(upcomingEvents(events, "2027-02-01").length).toBe(12);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });
});
