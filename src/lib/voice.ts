// The bar's voice assistant: what it knows, how it sounds, and the tools it can use.
// The site starts calls in the browser with Vapi; Vapi calls back to /api/voice/tool
// when the assistant places an order.

import {
  WEEKDAY_NAMES,
  addDays,
  describeDays,
  formatDate,
  formatTime,
  hoursOn,
  kitchenHoursOn,
  specialsOn,
  upcomingEvents,
  weekdayOf,
  type LocalNow,
} from "./schedule";
import { matchMenuItem, parsePrice, resolvePickup, type PickupDay } from "./ordering";
import type { Bar, BarEvent, HoursOverride, MenuItem, Special } from "./types";

export const VOICE_MODEL = "claude-haiku-5-5"; // fast enough for natural back-and-forth
export const ORDER_TOOL = "place_pickup_order";

interface BarData {
  events: BarEvent[];
  specials: Special[];
  menu: MenuItem[];
  overrides: HoursOverride[];
}

const range = (start: string | null, end: string | null) =>
  !start ? "all day" : end ? `${formatTime(start)} to ${formatTime(end)}` : `from ${formatTime(start)}`;

/** Everything the assistant should know, written as a briefing for it to speak from. */
export function voiceBriefing(bar: Bar, data: BarData, now: LocalNow, days: PickupDay[]): string {
  const lines: string[] = [];
  lines.push(
    `You are the friendly voice assistant for ${bar.name}, a neighborhood bar at ${bar.address}. Phone: ${bar.phone}.`,
    `${bar.tagline}.`,
    `Right now it is ${WEEKDAY_NAMES[now.weekday]}, ${formatDate(now.date)}, ${formatTime(`${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:${String(now.minutes % 60).padStart(2, "0")}`)}.`,
    "",
    "How to talk:",
    "- This is a spoken conversation. Keep answers short: one or two sentences, no lists or symbols.",
    "- Speak calmly and warmly, at an easy, unhurried pace, like a seasoned bartender who has worked here for years.",
    "- Say prices like \"twelve dollars\" and times like \"five thirty\".",
    "- Only use the facts below. If you don't know something, say so and suggest calling the bar.",
    "- Never make up menu items, prices, bands, or hours.",
    "",
    "Hours for the next week (bar, then kitchen):",
  );
  for (let i = 0; i < 7; i++) {
    const date = addDays(now.date, i);
    const bh = hoursOn(bar, data.overrides, date);
    const kh = kitchenHoursOn(bar, data.overrides, date);
    const name = i === 0 ? "Today" : WEEKDAY_NAMES[weekdayOf(date)];
    const note = data.overrides.find((o) => o.date === date)?.note;
    lines.push(
      `- ${name} (${formatDate(date)}): ${bh ? `open ${formatTime(bh.open)} to ${formatTime(bh.close)}` : "closed"}` +
        (bh && bar.kitchenHours ? `; kitchen ${kh ? `${formatTime(kh.open)} to ${formatTime(kh.close)}` : "closed"}` : "") +
        (note ? ` (${note})` : ""),
    );
  }
  if (bar.locationNote) lines.push(`Parking: ${bar.locationNote}`);

  const weekly = data.specials.filter((s) => s.active && !s.date);
  const today = specialsOn(data.specials, now.date);
  lines.push("", "Specials:");
  for (const s of weekly) {
    lines.push(`- ${s.title}${s.price ? ` (${s.price})` : ""}: ${describeDays(s.days)}, ${range(s.startTime, s.endTime)}. ${s.description}`.trim());
  }
  if (today.length > 0) lines.push(`Running today: ${today.map((s) => s.title).join(", ")}.`);

  const events = upcomingEvents(data.events, now.date, 10);
  lines.push("", "Upcoming live music and events:");
  if (events.length === 0) lines.push("- Nothing is on the calendar yet. Suggest checking the website or Facebook.");
  for (const e of events) {
    lines.push(`- ${formatDate(e.date)} at ${formatTime(e.startTime)}: ${e.title}${e.cover ? `, cover ${e.cover}` : ""}. ${e.description}`.trim());
  }

  lines.push("", "Menu (name, price, description):");
  let category = "";
  for (const item of [...data.menu].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (item.category !== category) {
      category = item.category;
      lines.push(`${category}:`);
    }
    lines.push(`- ${item.name}, ${item.price}${item.available ? "" : " (SOLD OUT today)"}. ${item.description}`.trim());
  }

  lines.push("", "Taking pickup orders:");
  if (!bar.onlineOrdering || days.length === 0) {
    lines.push("- Phone orders through you aren't available right now. Ask callers to call the bar directly.");
  } else {
    const windows = days.map((d) => `${d.label} from ${formatTime(d.times[0])} to ${formatTime(d.times[d.times.length - 1])}`);
    lines.push(
      `- Pickup times are every 15 minutes: ${windows.join("; or ")}.`,
      "- Collect the items and quantities, any notes (like hot or mild giardiniera), a first name, a phone number, and a pickup time.",
      "- Before placing it, read the order back with the total and ask the caller to confirm.",
      `- Then call ${ORDER_TOOL}. Tell the caller the order number it returns and that they'll pay at the bar when they pick up.`,
      "- If the tool says an item is unclear or sold out, ask the caller to choose again.",
    );
  }
  return lines.join("\n");
}

/** A calm, adult female voice, the default for every bar. */
export const DEFAULT_VOICE = "Clara";

/** What the assistant says when the call connects. */
export function greeting(barName: string) {
  return `${barName}! How can I help you?`;
}

/** Vapi assistant settings for a browser call. */
export function voiceAssistant(bar: Bar, data: BarData, now: LocalNow, days: PickupDay[], origin: string) {
  const canOrder = Boolean(bar.onlineOrdering) && days.length > 0;
  return {
    name: `${bar.name} assistant`.slice(0, 40),
    firstMessage: greeting(bar.name),
    maxDurationSeconds: 600,
    model: {
      provider: "anthropic" as const,
      model: VOICE_MODEL,
      temperature: 0.4,
      messages: [{ role: "system" as const, content: voiceBriefing(bar, data, now, days) }],
      tools: [
        { type: "endCall" as const },
        ...(canOrder
          ? [
              {
                type: "function" as const,
                function: {
                  name: ORDER_TOOL,
                  description: "Place a pickup order once the caller has confirmed the items, total, name, phone, and pickup time.",
                  parameters: {
                    type: "object" as const,
                    properties: {
                      items: {
                        type: "array" as const,
                        description: "What they're ordering, using menu item names.",
                        items: {
                          type: "object" as const,
                          properties: {
                            name: { type: "string" as const, description: "Menu item name, e.g. Italian Beef Chimi" },
                            quantity: { type: "number" as const },
                          },
                          required: ["name", "quantity"],
                        },
                      },
                      customer_name: { type: "string" as const },
                      phone: { type: "string" as const, description: "10-digit phone number" },
                      pickup_day: { type: "string" as const, description: "today, tomorrow, or a weekday name" },
                      pickup_time: { type: "string" as const, description: "e.g. 5:30 pm, or asap" },
                      notes: { type: "string" as const, description: "Requests for the kitchen, if any" },
                    },
                    required: ["items", "customer_name", "phone", "pickup_time"],
                  },
                },
                server: { url: `${origin}/api/voice/tool` },
                messages: [{ type: "request-start" as const, content: "One moment while I put that in." }],
              },
            ]
          : []),
      ],
    },
    voice: { provider: "vapi" as const, voiceId: bar.voiceId || DEFAULT_VOICE },
  };
}

export interface VoiceOrderArgs {
  items?: { name?: string; quantity?: number }[];
  customer_name?: string;
  phone?: string;
  pickup_day?: string;
  pickup_time?: string;
  notes?: string;
}

/**
 * Turns the assistant's tool call into an order request, or a sentence for the
 * assistant to say back when something needs fixing.
 */
export function voiceOrderRequest(args: VoiceOrderArgs, menu: MenuItem[], days: PickupDay[]) {
  const lines: { menuItemId: string; quantity: number }[] = [];
  for (const spoken of args.items ?? []) {
    const match = matchMenuItem(menu, spoken.name ?? "");
    if (!("item" in match)) {
      const options = match.candidates.map((c) => c.name).join(", or ");
      return {
        error: options
          ? `"${spoken.name}" could mean ${options}. Ask which one they want.`
          : `"${spoken.name}" isn't on the menu. Ask them to pick something from the menu.`,
      };
    }
    if (!match.item.available) return { error: `${match.item.name} is sold out today. Ask them to pick something else.` };
    if (parsePrice(match.item.price) === null) return { error: `${match.item.name} can't be ordered for pickup.` };
    lines.push({ menuItemId: match.item.id, quantity: Math.round(spoken.quantity ?? 1) });
  }
  if (lines.length === 0) return { error: "No items were given. Ask what they'd like to order." };
  const pickup = resolvePickup(days, args.pickup_day, args.pickup_time);
  if ("error" in pickup) return { error: pickup.error };
  return {
    request: {
      lines,
      customerName: args.customer_name ?? "",
      customerPhone: args.phone ?? "",
      pickupDate: pickup.date,
      pickupTime: pickup.time,
      notes: args.notes ?? "",
    },
  };
}
