// Turns an owner's text message ("Fri 9pm The Rusty Nails, $5 cover") into a
// structured update using Claude. Nothing is published until the owner replies YES.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Bar, MenuItem, ParsedUpdate, Weekday } from "./types";
import { WEEKDAY_NAMES, localNow } from "./schedule";

const MODEL = "claude-opus-5-5";

const date = z.string().describe("YYYY-MM-DD in the bar's local time");
const time = z.string().describe("HH:MM, 24-hour, bar's local time");

// Flat shape: every field is present, unused ones are null. Converted to ParsedUpdate below.
const ParsedTextSchema = z.object({
  kind: z.enum([
    "event",
    "special",
    "item_unavailable",
    "item_available",
    "hours_override",
    "unclear",
  ]),
  title: z.string().nullable().describe("Event or special name"),
  description: z.string().nullable(),
  date: date.nullable().describe("Event date, one-off special date, or hours-change date"),
  startTime: time.nullable(),
  endTime: time.nullable(),
  cover: z.string().nullable().describe('Event cover charge as written, e.g. "$5" or "Free"'),
  price: z.string().nullable().describe("Special pricing as written"),
  days: z.array(z.number().int().min(0).max(6)).describe("Weekdays for recurring specials, 0 = Sunday"),
  itemName: z.string().nullable().describe("Menu item name, matched to the menu list when possible"),
  closed: z.boolean().nullable().describe("For hours changes: closed all day"),
  open: time.nullable(),
  close: time.nullable(),
  note: z.string().nullable().describe('Reason for an hours change, e.g. "Thanksgiving"'),
  question: z.string().nullable().describe("When unclear: one short question back to the owner"),
});
type ParsedText = z.infer<typeof ParsedTextSchema>;

const SYSTEM = `You read text messages that a bar owner sends to update their bar's website.
Turn each message into exactly one update:
- "event": live music, trivia, karaoke, a game watch party, anything with a date and start time.
- "special": a food or drink deal. Recurring deals ("every Tuesday", "weekdays") use days and no date. One-off deals use date.
- "item_unavailable": a menu item is sold out or 86'd. "item_available": it's back.
- "hours_override": closing early, opening late, or closed on a specific date.
- "unclear": you can't tell what they want, or a required detail (like an event's date or time) is missing. Ask one short question.

Resolve relative dates ("tonight", "Friday", "next Sat") against today's date. A weekday name means the next one on or after today.
"9" or "9pm" for a bar event means 21:00. Keep the owner's own wording for titles and prices. Don't invent details.`;

export function buildPrompt(bar: Bar, menu: MenuItem[], message: string, now: Date): string {
  const today = localNow(now, bar.timezone);
  const items = menu.map((i) => i.name).join(", ") || "(no menu items yet)";
  return [
    `Bar: ${bar.name}`,
    `Today is ${WEEKDAY_NAMES[today.weekday]} ${today.date}.`,
    `Menu items: ${items}`,
    "",
    `Owner's message: ${message}`,
  ].join("\n");
}

const missing = (question: string): ParsedUpdate => ({ kind: "unclear", question });

/** Converts the model's flat output to a ParsedUpdate, asking a question if something required is missing. */
export function toParsedUpdate(p: ParsedText): ParsedUpdate {
  switch (p.kind) {
    case "event":
      if (!p.title || !p.date || !p.startTime) {
        return missing(p.question ?? "What's the event name, date, and start time?");
      }
      return {
        kind: "event",
        title: p.title,
        date: p.date,
        startTime: p.startTime,
        endTime: p.endTime,
        description: p.description ?? "",
        cover: p.cover,
      };
    case "special":
      if (!p.title || (!p.date && p.days.length === 0)) {
        return missing(p.question ?? "What's the special, and which day or days does it run?");
      }
      return {
        kind: "special",
        title: p.title,
        description: p.description ?? "",
        price: p.price,
        days: p.date ? [] : ([...new Set(p.days)] as Weekday[]),
        date: p.date,
        startTime: p.startTime,
        endTime: p.endTime,
      };
    case "item_unavailable":
    case "item_available":
      if (!p.itemName) return missing(p.question ?? "Which menu item?");
      return { kind: p.kind, itemName: p.itemName };
    case "hours_override": {
      const closed = p.closed ?? false;
      if (!p.date || (!closed && (!p.open || !p.close))) {
        return missing(p.question ?? "Which date, and what are the hours (or are you closed)?");
      }
      return {
        kind: "hours_override",
        date: p.date,
        closed,
        open: closed ? null : p.open,
        close: closed ? null : p.close,
        note: p.note ?? "",
      };
    }
    case "unclear":
      return missing(p.question ?? "Sorry, I didn't catch that. What would you like to post?");
  }
}

let client: Anthropic | null = null;

export async function parseOwnerText(
  bar: Bar,
  menu: MenuItem[],
  message: string,
  now = new Date(),
): Promise<ParsedUpdate> {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    // Low effort keeps replies fast; Twilio waits at most 15 seconds for the webhook.
    output_config: { effort: "low", format: betaZodOutputFormat(ParsedTextSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(bar, menu, message, now) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return missing("Sorry, I couldn't read that. Try something like: Fri 9pm The Rusty Nails, $5 cover");
  }
  return toParsedUpdate(response.parsed_output);
}
