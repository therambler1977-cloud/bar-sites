// Every change goes through here, whether it came from the admin or a text message,
// so the website and Google always get the same update.

import type { Store } from "./store";
import type { Bar, BarEvent, HoursOverride, MenuItem, ParsedUpdate, Special } from "./types";
import { describeDays, formatDate, formatTime, localNow } from "./schedule";
import { eventPost, publishPost, publishSpecialHours, specialPost } from "./google";

type NewEvent = Omit<BarEvent, "id" | "barId" | "googlePostName">;
type NewSpecial = Omit<Special, "id" | "barId" | "googlePostName" | "active">;
type NewOverride = Omit<HoursOverride, "id" | "barId">;

async function tryGoogle<T>(label: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch (error) {
    // The website update already succeeded; a Google failure shouldn't undo it.
    console.error(`Google sync failed (${label}):`, error);
    return null;
  }
}

export async function addEvent(store: Store, bar: Bar, input: NewEvent): Promise<BarEvent> {
  const event = await store.create("events", { ...input, barId: bar.id, googlePostName: null });
  const postName = await tryGoogle("event", () => publishPost(bar, eventPost(bar, event)));
  if (postName) return store.update("events", bar.id, event.id, { googlePostName: postName });
  return event;
}

export async function addSpecial(store: Store, bar: Bar, input: NewSpecial): Promise<Special> {
  const special = await store.create("specials", {
    ...input,
    barId: bar.id,
    active: true,
    googlePostName: null,
  });
  const postName = await tryGoogle("special", () => publishPost(bar, specialPost(special)));
  if (postName) return store.update("specials", bar.id, special.id, { googlePostName: postName });
  return special;
}

export async function setHoursOverride(
  store: Store,
  bar: Bar,
  input: NewOverride,
): Promise<HoursOverride> {
  const existing = (await store.list("hoursOverrides", bar.id)).find((o) => o.date === input.date);
  const override = existing
    ? await store.update("hoursOverrides", bar.id, existing.id, input)
    : await store.create("hoursOverrides", { ...input, barId: bar.id });
  await syncSpecialHours(store, bar);
  return override;
}

export async function removeHoursOverride(store: Store, bar: Bar, id: string) {
  await store.remove("hoursOverrides", bar.id, id);
  await syncSpecialHours(store, bar);
}

async function syncSpecialHours(store: Store, bar: Bar) {
  const overrides = await store.list("hoursOverrides", bar.id);
  const today = localNow(new Date(), bar.timezone).date;
  await tryGoogle("special hours", () => publishSpecialHours(bar, overrides, today));
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Finds a menu item from a loosely typed name, e.g. "wings" matches "Wings (8)". */
export function findMenuItem(items: MenuItem[], name: string): MenuItem | null {
  const wanted = normalize(name);
  if (!wanted) return null;
  return (
    items.find((i) => normalize(i.name) === wanted) ??
    items.find((i) => normalize(i.name).includes(wanted)) ??
    items.find((i) => wanted.includes(normalize(i.name))) ??
    null
  );
}

export function describeUpdate(update: ParsedUpdate): string {
  switch (update.kind) {
    case "event": {
      const time = update.endTime
        ? `${formatTime(update.startTime)} to ${formatTime(update.endTime)}`
        : formatTime(update.startTime);
      const cover = update.cover ? `, cover ${update.cover}` : "";
      return `New event: ${update.title}, ${formatDate(update.date)} at ${time}${cover}.`;
    }
    case "special": {
      const when = update.date ? formatDate(update.date) : describeDays(update.days);
      const time = update.startTime
        ? ` ${formatTime(update.startTime)}${update.endTime ? ` to ${formatTime(update.endTime)}` : ""}`
        : "";
      const price = update.price ? ` (${update.price})` : "";
      return `New special: ${update.title}${price}, ${when}${time}.`;
    }
    case "item_unavailable":
      return `Mark "${update.itemName}" as sold out.`;
    case "item_available":
      return `Mark "${update.itemName}" as back on the menu.`;
    case "hours_override":
      return update.closed
        ? `Closed on ${formatDate(update.date)}${update.note ? ` (${update.note})` : ""}.`
        : `Hours on ${formatDate(update.date)}: ${formatTime(update.open ?? "00:00")} to ${formatTime(update.close ?? "00:00")}${update.note ? ` (${update.note})` : ""}.`;
    case "unclear":
      return update.question;
  }
}

/** Applies a confirmed update and returns a short message for the owner. */
export async function applyUpdate(store: Store, bar: Bar, update: ParsedUpdate): Promise<string> {
  switch (update.kind) {
    case "event": {
      const { kind: _kind, ...input } = update;
      await addEvent(store, bar, input);
      return `Posted! "${update.title}" is on your site.`;
    }
    case "special": {
      const { kind: _kind, ...input } = update;
      await addSpecial(store, bar, input);
      return `Posted! "${update.title}" is on your site.`;
    }
    case "item_unavailable":
    case "item_available": {
      const items = await store.list("menuItems", bar.id);
      const item = findMenuItem(items, update.itemName);
      if (!item) return `I couldn't find "${update.itemName}" on your menu. Nothing changed.`;
      const available = update.kind === "item_available";
      await store.update("menuItems", bar.id, item.id, { available });
      return available ? `${item.name} is back on the menu.` : `${item.name} is marked sold out.`;
    }
    case "hours_override": {
      const { kind: _kind, ...input } = update;
      await setHoursOverride(store, bar, input);
      return `Updated hours for ${formatDate(update.date)}.`;
    }
    case "unclear":
      return update.question;
  }
}
