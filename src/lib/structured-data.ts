// schema.org markup so Google can show hours and events straight from the site.

import type { Bar, BarEvent, Weekday } from "./types";
import { utcOffset } from "./schedule";

const SCHEMA_DAYS: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export function barJsonLd(bar: Bar, events: BarEvent[]) {
  const place = { "@type": "BarOrPub", name: bar.name, address: bar.address };
  return [
    {
      "@context": "https://schema.org",
      ...place,
      description: bar.tagline,
      telephone: bar.phone,
      openingHoursSpecification: Object.entries(bar.weeklyHours).map(([day, hours]) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: SCHEMA_DAYS[Number(day) as Weekday],
        opens: hours.open,
        closes: hours.close,
      })),
      ...(bar.orderUrl ? { potentialAction: { "@type": "OrderAction", target: bar.orderUrl } } : {}),
    },
    ...events.map((e) => ({
      "@context": "https://schema.org",
      "@type": "Event",
      name: e.title,
      description: e.description || undefined,
      startDate: `${e.date}T${e.startTime}:00${utcOffset(e.date, bar.timezone)}`,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: place,
      ...(e.cover ? { offers: { "@type": "Offer", description: e.cover } } : {}),
    })),
  ];
}
