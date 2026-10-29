// Pushes events, specials, and holiday hours to the bar's Google Business Profile,
// so Maps and Search show the same thing as the website.
//
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for an OAuth app with the
// https://www.googleapis.com/auth/business.manage scope, plus a refresh token,
// account id, and location id stored on the bar (bar.google).

import type { Bar, BarEvent, HoursOverride, Special } from "./types";
import { describeDays, formatTime } from "./schedule";

interface GoogleDate {
  year: number;
  month: number;
  day: number;
}
interface GoogleTime {
  hours: number;
  minutes: number;
}

function googleDate(date: string): GoogleDate {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function googleTime(time: string): GoogleTime {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
}

export function eventPost(bar: Pick<Bar, "phone">, event: BarEvent) {
  const details = [event.description, event.cover ? `Cover: ${event.cover}` : ""]
    .filter(Boolean)
    .join(" ");
  return {
    languageCode: "en-US",
    topicType: "EVENT",
    summary: details || event.title,
    event: {
      title: event.title,
      schedule: {
        startDate: googleDate(event.date),
        startTime: googleTime(event.startTime),
        endDate: googleDate(event.date),
        endTime: googleTime(event.endTime ?? "23:59"),
      },
    },
    callToAction: { actionType: "CALL" },
  };
}

export function specialPost(special: Special) {
  const when = special.date
    ? ""
    : `${describeDays(special.days)}${special.startTime ? ` from ${formatTime(special.startTime)}` : ""}.`;
  const summary = [special.title, special.price, special.description, when]
    .filter(Boolean)
    .join(" · ");
  if (!special.date) {
    // Recurring specials go up as a standard post; Google offers need fixed dates.
    return { languageCode: "en-US", topicType: "STANDARD", summary };
  }
  return {
    languageCode: "en-US",
    topicType: "OFFER",
    summary,
    event: {
      title: special.title,
      schedule: {
        startDate: googleDate(special.date),
        endDate: googleDate(special.date),
      },
    },
    offer: {},
  };
}

/** Google replaces the full list of special hours, so this sends every upcoming override. */
export function specialHoursBody(overrides: HoursOverride[], today: string) {
  return {
    specialHours: {
      specialHourPeriods: overrides
        .filter((o) => o.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((o) =>
          o.closed || !o.open || !o.close
            ? { startDate: googleDate(o.date), closed: true }
            : {
                startDate: googleDate(o.date),
                openTime: googleTime(o.open),
                closeTime: googleTime(o.close),
              },
        ),
    },
  };
}

export function googleConfigured(bar: Bar): boolean {
  return Boolean(bar.google && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

async function accessToken(bar: Bar): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: bar.google?.refreshToken ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google token refresh failed: ${response.status}`);
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

async function googleRequest(bar: Bar, url: string, method: string, body: unknown) {
  const token = await accessToken(bar);
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Google ${method} ${url} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/** Creates a Google post and returns its resource name, or null when Google isn't connected. */
export async function publishPost(
  bar: Bar,
  post: ReturnType<typeof eventPost> | ReturnType<typeof specialPost>,
): Promise<string | null> {
  if (!googleConfigured(bar) || !bar.google) return null;
  const { accountId, locationId } = bar.google;
  const result = await googleRequest(
    bar,
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`,
    "POST",
    post,
  );
  return typeof result.name === "string" ? result.name : null;
}

export async function publishSpecialHours(
  bar: Bar,
  overrides: HoursOverride[],
  today: string,
): Promise<boolean> {
  if (!googleConfigured(bar) || !bar.google) return false;
  await googleRequest(
    bar,
    `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${bar.google.locationId}?updateMask=specialHours`,
    "PATCH",
    specialHoursBody(overrides, today),
  );
  return true;
}
