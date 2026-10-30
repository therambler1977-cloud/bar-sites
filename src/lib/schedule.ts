import type {
  Bar,
  BarEvent,
  DayHours,
  HoursOverride,
  Special,
  Weekday,
} from "./types";

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export interface LocalNow {
  date: string; // YYYY-MM-DD
  weekday: Weekday;
  minutes: number; // minutes since local midnight
}

export function localNow(now: Date, timezone: string): LocalNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    date,
    weekday: weekdayOf(date),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Hours for one calendar date, with any override applied. null = closed. */
export function hoursOn(
  bar: Pick<Bar, "weeklyHours">,
  overrides: HoursOverride[],
  date: string,
): DayHours | null {
  const override = overrides.find((o) => o.date === date);
  if (override) {
    if (override.closed || !override.open || !override.close) return null;
    return { open: override.open, close: override.close };
  }
  return bar.weeklyHours[weekdayOf(date)] ?? null;
}

export type OpenStatus =
  | { open: true; closesAt: string }
  | { open: false; opensAt: string | null; opensOn: string | null };

/** Open or closed right now for any daily schedule, handling hours that run past midnight. */
function statusFrom(hoursFor: (date: string) => DayHours | null, now: LocalNow): OpenStatus {
  // Last night's hours may still be running after midnight.
  const yesterday = hoursFor(addDays(now.date, -1));
  if (yesterday && toMinutes(yesterday.close) <= toMinutes(yesterday.open)) {
    if (now.minutes < toMinutes(yesterday.close)) {
      return { open: true, closesAt: yesterday.close };
    }
  }
  const today = hoursFor(now.date);
  if (today) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    const overnight = close <= open;
    if (now.minutes >= open && (overnight || now.minutes < close)) {
      return { open: true, closesAt: today.close };
    }
    if (now.minutes < open) {
      return { open: false, opensAt: today.open, opensOn: now.date };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const date = addDays(now.date, i);
    const hours = hoursFor(date);
    if (hours) return { open: false, opensAt: hours.open, opensOn: date };
  }
  return { open: false, opensAt: null, opensOn: null };
}

/** Whether the bar is open right now. */
export function openStatus(
  bar: Pick<Bar, "weeklyHours">,
  overrides: HoursOverride[],
  now: LocalNow,
): OpenStatus {
  return statusFrom((date) => hoursOn(bar, overrides, date), now);
}

/** Kitchen hours for a date. A closed day or holiday closure closes the kitchen too. */
export function kitchenHoursOn(
  bar: Pick<Bar, "weeklyHours" | "kitchenHours">,
  overrides: HoursOverride[],
  date: string,
): DayHours | null {
  const barHours = hoursOn(bar, overrides, date);
  if (!barHours || !bar.kitchenHours) return barHours;
  // A one-off hours change wins over the regular kitchen schedule for that day.
  if (overrides.some((o) => o.date === date)) return barHours;
  return bar.kitchenHours[weekdayOf(date)] ?? null;
}

/** Whether the kitchen is serving right now. */
export function kitchenStatus(
  bar: Pick<Bar, "weeklyHours" | "kitchenHours">,
  overrides: HoursOverride[],
  now: LocalNow,
): OpenStatus {
  return statusFrom((date) => kitchenHoursOn(bar, overrides, date), now);
}

export function specialRunsOn(special: Special, date: string): boolean {
  if (!special.active) return false;
  if (special.date) return special.date === date;
  return special.days.includes(weekdayOf(date));
}

export function specialsOn(specials: Special[], date: string): Special[] {
  return specials
    .filter((s) => specialRunsOn(s, date))
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

/** Events from today onward, soonest first. Tonight's event stays listed all day. */
export function upcomingEvents(events: BarEvent[], today: string, limit = 12): BarEvent[] {
  return events
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .slice(0, limit);
}

/** The most recent events before today, newest first. */
export function recentEvents(events: BarEvent[], today: string, limit = 6): BarEvent[] {
  return events
    .filter((e) => e.date < today)
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))
    .slice(0, limit);
}

/** "-05:00" style UTC offset for a local date in a timezone, for schema.org dates. */
export function utcOffset(date: string, timezone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" })
      .formatToParts(noon)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offset = name.replace("GMT", "");
  return offset === "" ? "+00:00" : offset;
}

export function describeDays(days: Weekday[]): string {
  if (days.length === 7) return "Every day";
  const sorted = [...days].sort();
  if (sorted.join() === "1,2,3,4,5") return "Weekdays";
  if (sorted.join() === "0,6") return "Weekends";
  // Three or more days in a row, even across the weekend, read as a range: "Wednesday–Sunday".
  const set = new Set(days);
  const starts = days.filter((d) => !set.has(((d + 6) % 7) as Weekday));
  if (days.length >= 3 && starts.length === 1) {
    const end = (starts[0] + days.length - 1) % 7;
    return `${WEEKDAY_NAMES[starts[0]]}–${WEEKDAY_NAMES[end]}`;
  }
  return sorted.map((d) => WEEKDAY_NAMES[d]).join(", ");
}
