import { describe, expect, it } from "vitest";
import { eventPost, specialHoursBody, specialPost } from "@/lib/google";
import { createSessionToken, hashPassword, readSessionToken, verifyPassword } from "@/lib/auth";
import { seedData } from "@/lib/seed";

describe("Google Business Profile posts", () => {
  const db = seedData(new Date("2026-10-29T17:00:00Z"));

  it("builds an event post with its schedule", () => {
    const post = eventPost(db.bars[0], db.events[0]);
    expect(post.topicType).toBe("EVENT");
    expect(post.event.schedule.startTime).toEqual({ hours: 21, minutes: 0 });
    expect(post.summary).toContain("Cover: $5");
  });

  it("posts recurring specials as standard posts", () => {
    const post = specialPost(db.specials[0]);
    expect(post.topicType).toBe("STANDARD");
    expect(post.summary).toContain("Tuesday from 4pm");
  });

  it("sends only upcoming special hours", () => {
    const body = specialHoursBody(
      [
        { id: "a", barId: "b", date: "2026-10-01", closed: true, open: null, close: null, note: "" },
        { id: "c", barId: "b", date: "2026-11-26", closed: true, open: null, close: null, note: "" },
        { id: "d", barId: "b", date: "2026-12-24", closed: false, open: "11:00", close: "18:00", note: "" },
      ],
      "2026-10-29",
    );
    expect(body.specialHours.specialHourPeriods).toEqual([
      { startDate: { year: 2026, month: 11, day: 26 }, closed: true },
      {
        startDate: { year: 2026, month: 12, day: 24 },
        openTime: { hours: 11, minutes: 0 },
        closeTime: { hours: 18, minutes: 0 },
      },
    ]);
  });
});

describe("admin auth", () => {
  it("verifies passwords", () => {
    const hash = hashPassword("secret");
    expect(verifyPassword("secret", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects tampered or expired sessions", () => {
    const token = createSessionToken("demo-bar", 0);
    expect(readSessionToken(token, 1000)).toBe("demo-bar");
    expect(readSessionToken(token.replace("demo-bar", "other-bar"), 1000)).toBeNull();
    expect(readSessionToken(token, 31 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
