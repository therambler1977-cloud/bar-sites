import { describe, expect, it } from "vitest";
import { matchMenuItem, pickupDays, resolvePickup } from "@/lib/ordering";
import { greeting, voiceAssistant, voiceBriefing, voiceOrderRequest } from "@/lib/voice";
import { seedData } from "@/lib/seed";

const db = seedData(new Date("2026-11-04T17:00:00Z"));
const bar = db.bars.find((b) => b.slug === "pub-78")!;
const menu = db.menuItems.filter((m) => m.barId === bar.id);
const data = { events: db.events.filter((e) => e.barId === bar.id), specials: db.specials.filter((s) => s.barId === bar.id), menu, overrides: [] };
// Wednesday 3pm in Brookfield; the kitchen opens at 4.
const now = { date: "2026-11-04", weekday: 3 as const, minutes: 15 * 60 };
const days = pickupDays(bar, [], now);

describe("matching spoken items to the menu", () => {
  it("finds items from partial names", () => {
    const m = matchMenuItem(menu, "beef chimi");
    expect("item" in m && m.item.name).toBe("Italian Beef Chimi");
    const c = matchMenuItem(menu, "cheese curds");
    expect("item" in c && c.item.name).toBe("Cheese Curds");
  });

  it("asks when a name could mean several things, and says when it's not on the menu", () => {
    const pizza = matchMenuItem(menu, "italian beef pizza");
    expect("candidates" in pizza && pizza.candidates.length).toBeGreaterThan(1);
    const none = matchMenuItem(menu, "lobster thermidor");
    expect(none).toEqual({ candidates: [] });
  });
});

describe("pickup times from speech", () => {
  it("rounds up to the next slot, reads bare evening times, and handles asap", () => {
    expect(resolvePickup(days, "today", "5:20 pm")).toEqual({ date: "2026-11-04", time: "17:30" });
    expect(resolvePickup(days, "today", "6")).toEqual({ date: "2026-11-04", time: "18:00" });
    expect(resolvePickup(days, undefined, "asap")).toEqual({ date: "2026-11-04", time: "16:30" });
  });

  it("explains when the time or day won't work", () => {
    expect(resolvePickup(days, "today", "11 pm")).toHaveProperty("error");
    expect(resolvePickup(days, "monday", "5 pm")).toHaveProperty("error");
  });
});

describe("the assistant", () => {
  it("knows the hours, specials, and menu, and can take orders", () => {
    const brief = voiceBriefing(bar, data, now, days);
    expect(brief).toContain("Pub 78");
    expect(brief).toContain("Happy Hour");
    expect(brief).toContain("Italian Beef Chimi");
    const a = voiceAssistant(bar, data, now, days, "https://example.com");
    const tool = a.model.tools.find((t) => t.type === "function") as { server: { url: string } };
    expect(tool.server.url).toBe("https://example.com/api/voice/tool");
  });

  it("turns a tool call into an order request", () => {
    const built = voiceOrderRequest(
      { items: [{ name: "beef chimi", quantity: 2 }], customer_name: "Sam", phone: "7085550123", pickup_time: "6 pm" },
      menu,
      days,
    );
    expect(built.request).toMatchObject({ customerName: "Sam", pickupTime: "18:00" });
    expect(built.request?.lines[0].quantity).toBe(2);
    expect(voiceOrderRequest({ items: [{ name: "lobster", quantity: 1 }] }, menu, days)).toHaveProperty("error");
  });
});

describe("the greeting", () => {
  it("uses the approved wording with the bar's name", () => {
    expect(voiceAssistant(bar, data, now, days, "https://example.com").firstMessage).toBe(
      "Hey, thanks for calling Pub 78! I can help with tonight's specials, our hours, upcoming events, or getting a food order started. What can I do for you?",
    );
  });
  it("leaves out ordering when the bar can't take orders", () => {
    expect(greeting("Pub 78", false)).toBe(
      "Hey, thanks for calling Pub 78! I can help with tonight's specials, our hours, or upcoming events. What can I do for you?",
    );
  });
});
