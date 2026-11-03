// Online ordering: prices, pickup times, and turning a guest's cart into an order.
// Everything here is checked again on the server, so a tampered cart can't change
// prices or order something that's sold out.

import { addDays, formatTime, kitchenHoursOn, toMinutes, type LocalNow } from "./schedule";
import type { Bar, HoursOverride, MenuItem, Order, OrderLine } from "./types";

/** Minutes the kitchen needs before the first pickup slot. */
export const PREP_MINUTES = 20;
const SLOT_MINUTES = 15;
const MAX_QUANTITY = 20;
const MAX_LINES = 30;

/** "$12" or "$12.50" → 1250 cents. Anything else (e.g. "Market price") can't be ordered online. */
export function parsePrice(price: string): number | null {
  const m = price.trim().match(/^\$(\d{1,4})(?:\.(\d{2}))?$/);
  return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : null;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface PickupDay {
  date: string;
  label: string; // "Today", "Tomorrow", or a weekday name
  times: string[]; // "HH:MM" local time, wrapping to "00:15" etc. after midnight
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Pickup times for the rest of today, plus the next day the kitchen is open,
 * so guests can still order ahead when the kitchen is closed right now.
 */
export function pickupDays(
  bar: Pick<Bar, "weeklyHours" | "kitchenHours">,
  overrides: HoursOverride[],
  now: LocalNow,
): PickupDay[] {
  const days: PickupDay[] = [];
  for (let offset = 0; offset < 8 && days.length < 2; offset++) {
    const date = addDays(now.date, offset);
    const hours = kitchenHoursOn(bar, overrides, date);
    if (!hours) continue;
    const open = toMinutes(hours.open);
    let close = toMinutes(hours.close);
    if (close <= open) close += 24 * 60;
    let start = open + PREP_MINUTES;
    if (offset === 0) start = Math.max(start, now.minutes + PREP_MINUTES);
    start = Math.ceil(start / SLOT_MINUTES) * SLOT_MINUTES;
    const times: string[] = [];
    for (let t = start; t <= close - SLOT_MINUTES; t += SLOT_MINUTES) {
      const m = t % (24 * 60);
      times.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }
    if (times.length === 0) continue;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const label = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : DAY_LABELS[weekday];
    days.push({ date, label, times });
  }
  return days;
}

export function pickupLabel(days: PickupDay[], date: string, time: string): string {
  const day = days.find((d) => d.date === date);
  return `${day?.label ?? date} at ${formatTime(time)}`;
}

export interface OrderRequest {
  lines: { menuItemId: string; quantity: number }[];
  customerName: string;
  customerPhone: string;
  pickupDate: string;
  pickupTime: string;
  notes: string;
}

export type OrderCheck =
  | { ok: true; order: Omit<Order, "id" | "number" | "createdAt"> }
  | { ok: false; error: string };

/** Validates a guest's order against the live menu and pickup times. */
export function checkOrder(
  barId: string,
  request: OrderRequest,
  menu: MenuItem[],
  days: PickupDay[],
): OrderCheck {
  const name = request.customerName.trim().slice(0, 60);
  const digits = request.customerPhone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (!name) return { ok: false, error: "Add your name so the bar knows whose order it is." };
  if (digits.length !== 10) return { ok: false, error: "Add a 10-digit phone number in case the bar needs to reach you." };

  const day = days.find((d) => d.date === request.pickupDate);
  if (!day || !day.times.includes(request.pickupTime)) {
    return { ok: false, error: "That pickup time isn't available anymore. Pick another one." };
  }

  if (request.lines.length === 0) return { ok: false, error: "Your order is empty." };
  if (request.lines.length > MAX_LINES) return { ok: false, error: "That's a big order. Call the bar to place it." };

  const lines: OrderLine[] = [];
  for (const { menuItemId, quantity } of request.lines) {
    const item = menu.find((m) => m.id === menuItemId);
    const price = item ? parsePrice(item.price) : null;
    if (!item || price === null) return { ok: false, error: "Something in your order is no longer on the menu." };
    if (!item.available) return { ok: false, error: `Sorry, ${item.name} just sold out. Remove it to continue.` };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return { ok: false, error: `Pick between 1 and ${MAX_QUANTITY} of ${item.name}.` };
    }
    const existing = lines.find((l) => l.menuItemId === item.id);
    if (existing) existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + quantity);
    else lines.push({ menuItemId: item.id, name: item.name, unitPrice: price, quantity });
  }

  return {
    ok: true,
    order: {
      barId,
      customerName: name,
      customerPhone: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
      pickupDate: day.date,
      pickupTime: request.pickupTime,
      notes: request.notes.trim().slice(0, 300),
      lines,
      subtotal: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
      status: "new",
      posOrderId: null,
    },
  };
}

/** The next short order number for a bar, starting at 101. */
export function nextOrderNumber(existing: Pick<Order, "number">[]): number {
  return existing.reduce((max, o) => Math.max(max, o.number), 100) + 1;
}

// ---------- Voice ordering: turning spoken words into menu items and pickup times ----------

const normalize = (text: string) =>
  text.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|a|an|order|of)\b/g, " ").replace(/\s+/g, " ").trim();

/**
 * Finds the menu item a caller means, e.g. "beef chimi" → "Italian Beef Chimi".
 * Returns the item, or the closest candidates when it's ambiguous or unknown.
 */
export function matchMenuItem(
  menu: MenuItem[],
  spoken: string,
): { item: MenuItem } | { candidates: MenuItem[] } {
  const want = normalize(spoken);
  const items = menu.filter((m) => parsePrice(m.price) !== null);
  const exact = items.filter((m) => normalize(m.name) === want);
  if (exact.length === 1) return { item: exact[0] };

  const words = want.split(" ").filter((w) => w.length > 1);
  const scored = items
    .map((m) => {
      const name = normalize(m.name);
      const nameWords = name.split(" ");
      const hits = words.filter((w) => nameWords.some((n) => n === w || (w.length > 3 && n.startsWith(w)))).length;
      const contains = name.includes(want) || want.includes(name) ? 1 : 0;
      return { m, score: hits / Math.max(words.length, 1) + contains };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { candidates: [] };
  const best = scored[0];
  const tied = scored.filter((s) => s.score === best.score);
  if (best.score >= 1 && tied.length === 1) return { item: best.m };
  return { candidates: scored.slice(0, 3).map((s) => s.m) };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Picks the first pickup slot at or after the requested time on the requested day ("asap" = soonest). */
export function resolvePickup(
  days: PickupDay[],
  day: string | undefined,
  time: string | undefined,
): { date: string; time: string } | { error: string } {
  if (days.length === 0) return { error: "Online ordering is closed right now." };
  const d = (day ?? "today").toLowerCase().trim();
  const target =
    d === "today" || d === "" ? days.find((x) => x.label === "Today")
    : d === "tomorrow" ? days.find((x) => x.label === "Tomorrow")
    : /^\d{4}-\d{2}-\d{2}$/.test(d) ? days.find((x) => x.date === d)
    : days.find((x) => x.label.toLowerCase() === d || WEEKDAYS[new Date(`${x.date}T12:00:00Z`).getUTCDay()] === d);
  if (!target) {
    const options = days.map((x) => `${x.label} ${formatTime(x.times[0])}–${formatTime(x.times[x.times.length - 1])}`).join(", or ");
    return { error: `The kitchen isn't taking orders for that day. Pickup is available ${options}.` };
  }
  const t = (time ?? "asap").toLowerCase().trim();
  if (t === "asap" || t === "" || t === "soonest") return { date: target.date, time: target.times[0] };
  const m = t.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
  if (!m) return { error: "Say the pickup time like 5:30 pm." };
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (m[3] === "pm" && hour < 12) hour += 12;
  if (m[3] === "am" && hour === 12) hour = 0;
  // A bare "5" or "6:30" at a bar means evening.
  if (!m[3] && hour >= 1 && hour <= 11 && toMinutes(target.times[0]) >= 12 * 60) hour += 12;
  const wanted = hour * 60 + minute;
  const slot = target.times.find((s) => toMinutes(s) >= wanted);
  if (!slot) {
    return { error: `The last pickup ${target.label.toLowerCase()} is ${formatTime(target.times[target.times.length - 1])}.` };
  }
  return { date: target.date, time: slot };
}
