import { describe, expect, it } from "vitest";
import { checkOrder, nextOrderNumber, parsePrice, pickupDays, type OrderRequest } from "@/lib/ordering";
import { seedData } from "@/lib/seed";
import type { MenuItem } from "@/lib/types";

const db = seedData(new Date("2026-11-01T17:00:00Z"));
const pub78 = db.bars.find((b) => b.slug === "pub-78")!;
const menu = db.menuItems.filter((m) => m.barId === pub78.id);

describe("prices", () => {
  it("reads whole and cents prices, and rejects anything else", () => {
    expect(parsePrice("$12")).toBe(1200);
    expect(parsePrice("$12.50")).toBe(1250);
    expect(parsePrice("Market price")).toBeNull();
    expect(parsePrice("$3 drafts")).toBeNull();
  });
});

describe("pickup times", () => {
  it("starts 20 minutes out, in 15-minute steps, and stops before the kitchen closes", () => {
    // Sunday 1:05pm; Pub 78's kitchen runs noon to 6pm on Sundays.
    const days = pickupDays(pub78, [], { date: "2026-11-01", weekday: 0, minutes: 13 * 60 + 5 });
    expect(days[0].label).toBe("Today");
    expect(days[0].times[0]).toBe("13:30");
    expect(days[0].times.at(-1)).toBe("17:45");
    // Monday and Tuesday are closed, so the next choice is Wednesday.
    expect(days[1]).toMatchObject({ date: "2026-11-04", label: "Wednesday" });
    expect(days[1].times[0]).toBe("16:30");
  });

  it("skips today once the kitchen has closed", () => {
    const days = pickupDays(pub78, [], { date: "2026-11-01", weekday: 0, minutes: 18 * 60 });
    expect(days.map((d) => d.label)).toEqual(["Wednesday", "Thursday"]);
  });

  it("respects a closed day override", () => {
    const closed = [{ id: "x", barId: pub78.id, date: "2026-11-04", closed: true, open: null, close: null, note: "" }];
    const days = pickupDays(pub78, closed, { date: "2026-11-03", weekday: 2, minutes: 600 });
    expect(days[0].date).toBe("2026-11-05");
  });
});

describe("checking an order", () => {
  const days = pickupDays(pub78, [], { date: "2026-11-01", weekday: 0, minutes: 13 * 60 });
  const item = menu.find((m) => parsePrice(m.price) !== null)!;
  const base: OrderRequest = {
    lines: [{ menuItemId: item.id, quantity: 2 }],
    customerName: "  Sam  ",
    customerPhone: "1-708-555-0123",
    pickupDate: days[0].date,
    pickupTime: days[0].times[0],
    notes: "",
  };

  it("prices the order from the menu, not the guest", () => {
    const result = checkOrder(pub78.id, base, menu, days);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.customerName).toBe("Sam");
    expect(result.order.customerPhone).toBe("(708) 555-0123");
    expect(result.order.subtotal).toBe(parsePrice(item.price)! * 2);
    expect(result.order.status).toBe("new");
  });

  it("refuses sold-out items, bad times, and missing details", () => {
    const soldOut: MenuItem[] = menu.map((m) => (m.id === item.id ? { ...m, available: false } : m));
    expect(checkOrder(pub78.id, base, soldOut, days).ok).toBe(false);
    expect(checkOrder(pub78.id, { ...base, pickupTime: "03:00" }, menu, days).ok).toBe(false);
    expect(checkOrder(pub78.id, { ...base, customerPhone: "555" }, menu, days).ok).toBe(false);
    expect(checkOrder(pub78.id, { ...base, lines: [{ menuItemId: item.id, quantity: 0 }] }, menu, days).ok).toBe(false);
    expect(checkOrder(pub78.id, { ...base, lines: [{ menuItemId: "nope", quantity: 1 }] }, menu, days).ok).toBe(false);
  });

  it("numbers orders from 101", () => {
    expect(nextOrderNumber([])).toBe(101);
    expect(nextOrderNumber([{ number: 101 }, { number: 104 }])).toBe(105);
  });
});
