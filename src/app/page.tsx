import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentBar } from "@/lib/tenant";
import { getStore } from "@/lib/store";
import {
  WEEKDAY_NAMES,
  addDays,
  describeDays,
  formatDate,
  formatTime,
  hoursOn,
  kitchenHoursOn,
  kitchenStatus,
  localNow,
  openStatus,
  specialsOn,
  recentEvents,
  upcomingEvents,
} from "@/lib/schedule";
import { barJsonLd } from "@/lib/structured-data";
import type { BarEvent, MenuItem, Weekday } from "@/lib/types";
import { PhotoSection } from "./photo-section";
import { VoiceButton } from "./voice-button";
import { voiceAssistant } from "@/lib/voice";
import { MenuOrdering } from "./menu-ordering";
import { pickupDays } from "@/lib/ordering";

// Specials, hours, and "open now" depend on the current time, so never cache this page.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const bar = await getCurrentBar();
  if (!bar) return {};
  return { title: bar.name, description: bar.tagline };
}

function timeRange(start: string | null, end: string | null) {
  if (!start) return "All day";
  return end ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start);
}

function eventItem(e: BarEvent) {
  const [, month, day] = e.date.split("-").map(Number);
  const monthName = new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return (
    <li key={e.id} className="event">
      <div className="event-date" aria-hidden="true">
        <span className="event-month">{monthName}</span>
        <span className="event-day">{day}</span>
      </div>
      <div className="event-body">
        <h3>{e.title}</h3>
        <p className="event-meta">
          {formatDate(e.date)} · {timeRange(e.startTime, e.endTime)}
          {e.cover ? ` · ${e.cover}` : ""}
        </p>
        {e.description && <p className="muted">{e.description}</p>}
      </div>
    </li>
  );
}

export default async function BarHome() {
  const bar = await getCurrentBar();
  if (!bar) notFound();
  const store = await getStore();
  const [events, specials, menu, overrides] = await Promise.all([
    store.list("events", bar.id),
    store.list("specials", bar.id),
    store.list("menuItems", bar.id),
    store.list("hoursOverrides", bar.id),
  ]);

  const now = localNow(new Date(), bar.timezone);
  const pickup = pickupDays(bar, overrides, now);

  // The "Talk to us" voice assistant shows once the bar's Vapi public key is set.
  const vapiKey = process.env.VAPI_PUBLIC_KEY;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const proto = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const assistant = vapiKey
    ? voiceAssistant(bar, { events, specials, menu, overrides }, now, pickup, `${proto}://${host}`)
    : null;
  const status = openStatus(bar, overrides, now);
  const kitchen = bar.kitchenHours ? kitchenStatus(bar, overrides, now) : null;
  const todaysSpecials = specialsOn(specials, now.date);
  const upcoming = upcomingEvents(events, now.date);
  const tonight = upcoming.filter((e) => e.date === now.date);
  const recent = recentEvents(events, now.date);
  const musicPhotos = (bar.photos ?? []).filter((p) => (p.kind ?? "music") === "music");
  const reviews = bar.reviews ?? [];
  const venuePhotos = (bar.photos ?? []).filter((p) => p.kind === "venue");
  const foodPhotos = (bar.photos ?? []).filter((p) => p.kind === "food");
  const weekly = specials.filter((s) => s.active && !s.date);
  const notices = overrides
    .filter((o) => o.date >= now.date && o.date <= addDays(now.date, 14))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Ordering on the site takes guests to the menu; otherwise use the bar's own ordering page.
  const orderHref = bar.onlineOrdering ? "#menu" : bar.orderUrl;

  const categories = new Map<string, MenuItem[]>();
  for (const item of [...menu].sort((a, b) => a.sortOrder - b.sortOrder)) {
    categories.set(item.category, [...(categories.get(item.category) ?? []), item]);
  }

  // Links for the header, in page order, only for sections that will show.
  const photoCount = musicPhotos.length + venuePhotos.length + foodPhotos.length;
  const sections = [
    ["menu", "Menu", categories.size > 0],
    ["events", "Events", true],
    ["specials", "Specials", weekly.length > 0],
    ["photos", "Photos", photoCount > 0],
    ["visit", "Visit", true],
].filter(([, , shown]) => shown) as [string, string, boolean][];

  const statusText = status.open
    ? `Open now · until ${formatTime(status.closesAt)}`
    : status.opensAt
      ? `Closed · opens ${status.opensOn === now.date ? "today" : WEEKDAY_NAMES[new Date(`${status.opensOn}T12:00:00Z`).getUTCDay()]} ${formatTime(status.opensAt)}`
      : "Closed";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${bar.name} ${bar.address}`)}`;
  const tel = `tel:${bar.phone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="site" data-motif={bar.motif ?? undefined} style={{ "--accent": bar.accentColor } as React.CSSProperties}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(barJsonLd(bar, upcoming)) }}
      />

      <header className="site-header">
        <div className="wrap header-row">
          <a href="#top" className="wordmark">{bar.name}</a>
          <span className={`status ${status.open ? "is-open" : ""}`}>{statusText}</span>
        </div>
        <nav className="wrap section-nav" aria-label="Sections">
          <ul>
            {sections.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="top">
        <section className={`hero ${bar.heroImageUrl ? "has-photo" : ""}`}>
          {bar.heroImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hero-photo" src={bar.heroImageUrl} alt="" fetchPriority="high" />
          )}
          <div className={`wrap hero-content ${bar.logoUrl ? "has-logo" : ""}`}>
            {bar.logoUrl && (
              <div className="logo-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bar.logoUrl} alt={`${bar.name} logo`} width={400} height={390} />
              </div>
            )}
            <h1>{bar.name}</h1>
            <p className="tagline">{bar.tagline}</p>
            <div className="actions hero-actions">
              {orderHref && (
                <a className="button primary" href={orderHref}>Order online</a>
              )}
              <a className="button" href={tel}>Call {bar.phone}</a>
              <a className="button" href={mapsUrl}>Directions</a>
            </div>
          </div>
        </section>

        {notices.length > 0 && (
          <section className="wrap notices" aria-label="Hours changes">
            {notices.map((o) => (
              <p key={o.id} className="notice">
                <strong>{formatDate(o.date)}:</strong>{" "}
                {o.closed ? "Closed" : `Open ${formatTime(o.open ?? "")}–${formatTime(o.close ?? "")}`}
                {o.note ? ` · ${o.note}` : ""}
              </p>
            ))}
          </section>
        )}

        <section className="wrap today" aria-labelledby="today-heading">
          <div className="board">
            <h2 id="today-heading" className="eyebrow">Today · {WEEKDAY_NAMES[now.weekday]}</h2>
            {kitchen && (
              <p className={`kitchen ${kitchen.open ? "is-open" : ""}`}>
                {kitchen.open
                  ? `Kitchen open until ${formatTime(kitchen.closesAt)}`
                  : kitchen.opensOn === now.date && kitchen.opensAt
                    ? `Kitchen opens at ${formatTime(kitchen.opensAt)}`
                    : "Kitchen closed"}
              </p>
            )}
            {todaysSpecials.length === 0 && tonight.length === 0 ? (
              <p className="muted">No specials today. Check out what's coming up below.</p>
            ) : (
              <ul className="today-list">
                {tonight.map((e) => (
                  <li key={e.id}>
                    <span className="today-time">{formatTime(e.startTime)}</span>
                    <span className="today-title">{e.title}</span>
                    {e.cover && <span className="today-price">{e.cover}</span>}
                  </li>
                ))}
                {todaysSpecials.map((s) => (
                  <li key={s.id}>
                    <span className="today-time">{timeRange(s.startTime, s.endTime)}</span>
                    <span className="today-title">{s.title}</span>
                    {s.price && <span className="today-price">{s.price}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {vapiKey && assistant && <VoiceButton publicKey={vapiKey} assistant={assistant} />}
        </section>

        {categories.size > 0 && (
          <section className="wrap" id="menu" aria-labelledby="menu-heading">
            <h2 id="menu-heading">Menu</h2>
            <MenuOrdering
              categories={[...categories]}
              ordering={
                bar.onlineOrdering
                  ? {
                      storageKey: `order:${bar.id}`,
                      days: pickup,
                      barName: bar.name,
                      address: bar.address,
                    }
                  : null
              }
            />
          </section>
        )}

        <section className="wrap" id="events" aria-labelledby="events-heading">
          <h2 id="events-heading">Coming up</h2>
          {upcoming.length === 0 ? (
            <p className="muted">Nothing on the calendar yet.</p>
          ) : (
            <ol className="events">{upcoming.slice(0, 5).map(eventItem)}</ol>
          )}
          {upcoming.length > 5 && (
            <details className="more">
              <summary>See all {upcoming.length} upcoming</summary>
              <ol className="events">{upcoming.slice(5).map(eventItem)}</ol>
            </details>
          )}
          {recent.length > 0 && (
            <details className="more">
              <summary>Past shows</summary>
              <ul className="recent-events">
                {recent.map((e) => (
                  <li key={e.id}>
                    <span className="recent-date">{formatDate(e.date)}</span>
                    <span>{e.title}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {weekly.length > 0 && (
          <section className="wrap" id="specials" aria-labelledby="specials-heading">
            <h2 id="specials-heading">Weekly specials</h2>
            <ul className="specials">
              {weekly.map((s) => (
                <li key={s.id} className="special">
                  <p className="eyebrow">{describeDays(s.days)} · {timeRange(s.startTime, s.endTime)}</p>
                  <h3>{s.title}</h3>
                  {s.price && <p className="special-price">{s.price}</p>}
                  {s.description && <p className="muted">{s.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {photoCount > 0 && (
          <section className="wrap" id="photos" aria-labelledby="photos-heading">
            <h2 id="photos-heading">Photos</h2>
            <PhotoSection
              groups={[
                { label: "Live music", photos: musicPhotos },
                { label: "The bar", photos: venuePhotos },
                { label: "Food", photos: foodPhotos },
              ]}
            />
          </section>
        )}

        {reviews.length > 0 && (
          <section className="wrap reviews-strip" id="reviews" aria-labelledby="reviews-heading">
            <h2 id="reviews-heading">What people say</h2>
            <ul className="reviews">
              {reviews.map((r) => (
                <li key={r.author + r.quote.slice(0, 20)}>
                  <figure className="review">
                    <blockquote>{r.quote}</blockquote>
                    <figcaption>{r.author}{r.source ? ` · ${r.source} review` : ""}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="wrap" id="visit" aria-labelledby="visit-heading">
          <h2 id="visit-heading">Visit</h2>
          <div className="find-us">
            <iframe
              className="map"
              title={`Map showing ${bar.name}`}
              src={`https://www.google.com/maps?q=${encodeURIComponent(`${bar.name}, ${bar.address}`)}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="find-us-text">
              <p className="find-us-address">{bar.address}</p>
              {bar.locationNote && <p className="muted">{bar.locationNote}</p>}
              <div className="actions">
                <a className="button primary" href={mapsUrl}>Get directions</a>
                <a className="button" href={tel}>Call {bar.phone}</a>
              </div>
              <h3 className="visit-subhead" id="hours">Hours</h3>
              <table className="hours">
                {bar.kitchenHours && (
                  <thead>
                    <tr>
                      <td />
                      <th scope="col">Bar</th>
                      <th scope="col">Kitchen</th>
                    </tr>
                  </thead>
                )}
                <tbody>
                  {Array.from({ length: 7 }, (_, i) => {
                    const date = addDays(now.date, i);
                    const day = ((now.weekday + i) % 7) as Weekday;
                    const hours = hoursOn(bar, overrides, date);
                    const food = kitchenHoursOn(bar, overrides, date);
                    return (
                      <tr key={date} className={i === 0 ? "is-today" : ""}>
                        <th scope="row">{i === 0 ? "Today" : WEEKDAY_NAMES[day]}</th>
                        <td>{hours ? `${formatTime(hours.open)}–${formatTime(hours.close)}` : "Closed"}</td>
                        {bar.kitchenHours && (
                          <td>{food ? `${formatTime(food.open)}–${formatTime(food.close)}` : "—"}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <nav className="call-bar" aria-label="Quick actions">
        {orderHref && <a href={orderHref}>Order</a>}
        <a href={tel}>Call</a>
        <a href={mapsUrl}>Directions</a>
      </nav>

      <footer className="site-footer">
        <div className="wrap footer-row">
          {bar.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="footer-logo" src={bar.logoUrl} alt="" width={80} height={78} />
          )}
          <div className="footer-text">
            <p className="wordmark">{bar.name}</p>
            <p>{bar.address}</p>
            <p><a href={tel}>{bar.phone}</a></p>
          </div>
          {(bar.social?.facebook || bar.social?.instagram) && (
            <ul className="social" aria-label="Follow us">
              {bar.social.facebook && (
                <li>
                  <a href={bar.social.facebook} aria-label="Facebook" rel="noopener">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9Z" /></svg>
                  </a>
                </li>
              )}
              {bar.social.instagram && (
                <li>
                  <a href={bar.social.instagram} aria-label="Instagram" rel="noopener">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.3A4.7 4.7 0 1 0 12 16.7 4.7 4.7 0 0 0 12 7.3Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM12 4.6c2.4 0 2.7 0 3.6.1 2.4.1 3.6 1.3 3.7 3.7.1.9.1 1.2.1 3.6s0 2.7-.1 3.6c-.1 2.4-1.3 3.6-3.7 3.7-.9.1-1.2.1-3.6.1s-2.7 0-3.6-.1c-2.4-.1-3.6-1.3-3.7-3.7-.1-.9-.1-1.2-.1-3.6s0-2.7.1-3.6C4.8 6 6 4.8 8.4 4.7c.9-.1 1.2-.1 3.6-.1ZM12 3c-2.4 0-2.8 0-3.7.1C5 3.2 3.2 5 3.1 8.3 3 9.2 3 9.6 3 12s0 2.8.1 3.7c.1 3.3 1.9 5.1 5.2 5.2.9.1 1.3.1 3.7.1s2.8 0 3.7-.1c3.3-.1 5.1-1.9 5.2-5.2.1-.9.1-1.3.1-3.7s0-2.8-.1-3.7C20.8 5 19 3.2 15.7 3.1 14.8 3 14.4 3 12 3Z" /></svg>
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>
      </footer>
    </div>
  );
}
