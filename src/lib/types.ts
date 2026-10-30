// All dates and times are local to the bar's timezone:
// dates are "YYYY-MM-DD", times are "HH:MM" (24-hour).

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface DayHours {
  open: string;
  close: string; // may be earlier than open, meaning it closes after midnight
}

export interface GoogleLink {
  accountId: string;
  locationId: string;
  refreshToken: string;
}

export interface Bar {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  timezone: string; // IANA, e.g. "America/Chicago"
  phone: string;
  address: string;
  domains: string[]; // custom domains that serve this bar's site
  accentColor: string;
  orderUrl: string | null; // the bar's existing online ordering page, if any
  smsNumber: string | null; // Twilio number the owner texts updates to
  ownerPhones: string[]; // numbers allowed to text updates, E.164
  adminPasswordHash: string; // scrypt, see auth.ts
  weeklyHours: Partial<Record<Weekday, DayHours>>; // missing day = closed
  google: GoogleLink | null;
}

export interface BarEvent {
  id: string;
  barId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string | null;
  description: string;
  cover: string | null; // e.g. "$5" or "Free"
  googlePostName: string | null;
}

export interface Special {
  id: string;
  barId: string;
  title: string;
  description: string;
  price: string | null;
  // Recurring specials list weekdays; one-off specials set a date instead.
  days: Weekday[];
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  active: boolean;
  googlePostName: string | null;
}

export interface MenuItem {
  id: string;
  barId: string;
  category: string;
  name: string;
  description: string;
  price: string;
  available: boolean; // false = 86'd
  sortOrder: number;
}

export interface HoursOverride {
  id: string;
  barId: string;
  date: string;
  closed: boolean;
  open: string | null;
  close: string | null;
  note: string;
}

// What an owner's text message turns into before they confirm it.
export type ParsedUpdate =
  | {
      kind: "event";
      title: string;
      date: string;
      startTime: string;
      endTime: string | null;
      description: string;
      cover: string | null;
    }
  | {
      kind: "special";
      title: string;
      description: string;
      price: string | null;
      days: Weekday[];
      date: string | null;
      startTime: string | null;
      endTime: string | null;
    }
  | { kind: "item_unavailable"; itemName: string }
  | { kind: "item_available"; itemName: string }
  | {
      kind: "hours_override";
      date: string;
      closed: boolean;
      open: string | null;
      close: string | null;
      note: string;
    }
  | { kind: "unclear"; question: string };

export interface PendingUpdate {
  id: string;
  barId: string;
  fromPhone: string;
  update: ParsedUpdate;
  createdAt: string; // ISO timestamp
}
