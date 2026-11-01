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

export interface BarPhoto {
  src: string;
  alt: string;
  // "music" goes in the Live music section, "venue" (inside and outside) in The bar.
  kind?: "music" | "venue" | "food"; // missing = music, for photos saved before venue photos existed
}

export interface Review {
  quote: string;
  author: string; // first name and last initial, e.g. "Kerry O."
  source: string | null; // e.g. "Google"; null when unknown
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
  logoUrl: string | null; // shown on a light card, so a logo with a white background works
  heroImageUrl?: string | null; // wide photo behind the bar's name at the top of the page
  locationNote?: string | null; // shown under the map, e.g. where to park
  photos: BarPhoto[]; // live music and venue shots, shown in order within each section
  reviews?: Review[]; // customer quotes, shown in order
  orderUrl: string | null; // the bar's existing online ordering page, if any
  // Ordering built into the site. "demo" keeps orders on the site only (pay at pickup);
  // "clover" also sends each order to the bar's Clover POS. null/missing = off.
  onlineOrdering?: "demo" | "clover" | null;
  smsNumber: string | null; // Twilio number the owner texts updates to
  ownerPhones: string[]; // numbers allowed to text updates, E.164
  adminPasswordHash: string; // scrypt, see auth.ts
  weeklyHours: Partial<Record<Weekday, DayHours>>; // missing day = closed
  // When food is served, if it differs from bar hours. null = kitchen follows bar hours.
  kitchenHours: Partial<Record<Weekday, DayHours>> | null;
  google: GoogleLink | null;
  social?: { facebook?: string | null; instagram?: string | null }; // full profile URLs
  motif?: "rail" | null; // optional decorative theme; "rail" adds train-track dividers
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

export interface OrderLine {
  menuItemId: string;
  name: string;
  unitPrice: number; // cents, copied from the menu when the order was placed
  quantity: number;
}

export type OrderStatus = "new" | "ready" | "picked_up";

export interface Order {
  id: string;
  barId: string;
  number: number; // short number the guest gives at the bar, e.g. 104
  customerName: string;
  customerPhone: string;
  pickupDate: string;
  pickupTime: string;
  notes: string;
  lines: OrderLine[];
  subtotal: number; // cents
  status: OrderStatus;
  createdAt: string; // ISO timestamp
  posOrderId: string | null; // the order's id in the bar's POS, once sent
}
