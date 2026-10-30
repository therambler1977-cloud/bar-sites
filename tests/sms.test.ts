import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { MemoryStore } from "@/lib/store";
import { seedData } from "@/lib/seed";
import { handleOwnerText, twiml, validTwilioSignature, type TextParser } from "@/lib/sms";
import { findMenuItem } from "@/lib/publish";
import { toParsedUpdate } from "@/lib/parse-text";
import type { ParsedUpdate } from "@/lib/types";

const OWNER = "+15550001111";
const BAR_NUMBER = "+15550104478";

function setup(update: ParsedUpdate) {
  const store = new MemoryStore(seedData(new Date("2026-10-29T17:00:00Z")));
  const parse: TextParser = async () => update;
  const text = (body: string, from = OWNER) =>
    handleOwnerText(store, { to: BAR_NUMBER, from, body }, parse);
  return { store, text };
}

const event: ParsedUpdate = {
  kind: "event",
  title: "Open Mic",
  date: "2026-11-06",
  startTime: "21:00",
  endTime: null,
  description: "",
  cover: "$5",
};

describe("text-to-update", () => {
  it("previews, then posts on YES", async () => {
    const { store, text } = setup(event);
    expect(await text("Fri 9pm open mic $5")).toBe(
      "New event: Open Mic, Fri, Nov 6 at 9pm, cover $5.\nReply YES to post or NO to cancel.",
    );
    expect((await store.list("events", "demo-bar")).some((e) => e.title === "Open Mic")).toBe(false);

    expect(await text("yes")).toBe('Posted! "Open Mic" is on your site.');
    expect((await store.list("events", "demo-bar")).some((e) => e.title === "Open Mic")).toBe(true);
    expect(await store.list("pendingUpdates", "demo-bar")).toEqual([]);
  });

  it("cancels on NO", async () => {
    const { store, text } = setup(event);
    await text("Fri 9pm open mic");
    expect(await text("no")).toBe("Canceled. Nothing was posted.");
    expect(await text("yes")).toBe("Nothing waiting to post. Text me an update first.");
    expect((await store.list("events", "demo-bar")).some((e) => e.title === "Open Mic")).toBe(false);
  });

  it("ignores numbers that aren't the owner's", async () => {
    const { text } = setup(event);
    expect(await text("Fri 9pm open mic", "+15559999999")).toBeNull();
  });

  it("marks a menu item sold out from a loose name", async () => {
    const { store, text } = setup({ kind: "item_unavailable", itemName: "wings" });
    await text("out of wings");
    expect(await text("YES")).toBe("Wings (8) is marked sold out.");
    const wings = (await store.list("menuItems", "demo-bar")).find((i) => i.name === "Wings (8)");
    expect(wings?.available).toBe(false);
  });

  it("asks a question instead of saving when unclear", async () => {
    const { store, text } = setup({ kind: "unclear", question: "What time does it start?" });
    expect(await text("band friday")).toBe("What time does it start?");
    expect(await store.list("pendingUpdates", "demo-bar")).toEqual([]);
  });
});

describe("toParsedUpdate", () => {
  const blank = {
    title: null, description: null, date: null, startTime: null, endTime: null, cover: null,
    price: null, days: [], itemName: null, closed: null, open: null, close: null, note: null, question: null,
  };

  it("asks when an event has no time", () => {
    const result = toParsedUpdate({ ...blank, kind: "event", title: "Band", date: "2026-11-06" });
    expect(result.kind).toBe("unclear");
  });

  it("keeps recurring specials as weekdays", () => {
    const result = toParsedUpdate({ ...blank, kind: "special", title: "Taco Tuesday", days: [2, 2] });
    expect(result).toMatchObject({ kind: "special", days: [2], date: null });
  });

  it("clears times on a full-day closure", () => {
    const result = toParsedUpdate({ ...blank, kind: "hours_override", date: "2026-11-26", closed: true, open: "15:00" });
    expect(result).toEqual({ kind: "hours_override", date: "2026-11-26", closed: true, open: null, close: null, note: "" });
  });
});

describe("helpers", () => {
  it("matches menu items loosely", () => {
    const items = seedData().menuItems;
    expect(findMenuItem(items, "anchor burger")?.name).toBe("Anchor Burger");
    expect(findMenuItem(items, "pizza")).toBeNull();
  });

  it("validates Twilio signatures", () => {
    const url = "https://example.com/api/sms";
    const params = { To: BAR_NUMBER, From: OWNER, Body: "hi" };
    const signature = createHmac("sha1", "token")
      .update(url + "Bodyhi" + "From" + OWNER + "To" + BAR_NUMBER)
      .digest("base64");
    expect(validTwilioSignature("token", signature, url, params)).toBe(true);
    expect(validTwilioSignature("token", signature, url, { ...params, Body: "bye" })).toBe(false);
    expect(validTwilioSignature("token", null, url, params)).toBe(false);
  });

  it("escapes reply text in TwiML", () => {
    expect(twiml("Wings & <tacos>")).toContain("<Message>Wings &#38; &#60;tacos&#62;</Message>");
    expect(twiml(null)).toContain("<Response></Response>");
  });
});
