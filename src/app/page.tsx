import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  upcomingEvents,
} from "@/lib/schedule";
import { barJsonLd } from "@/lib/structured-data";
import type { MenuItem, Weekday } from "@/lib/types";

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
  const status = openStatus(bar, overrides, now);
  const kitchen = bar.kitchenHours ? kitchenStatus(bar, overrides, now) : null;
  const todaysSpecials = specialsOn(specials, now.date);
  const upcoming = upcomingEvents(events, now.date);
  const tonight = upcoming.filter((e) => e.date === now.date);
  const weekly = specials.filter((s) => s.active && !s.date);
  const notices = overrides
    .filter((o) => o.date >= now.date && o.date <= addDays(now.date, 14))
    .sort((a, b) => a.date.localeCompare(b.date));

  const categories = new Map<string, MenuItem[]>();
  for (const item of [...menu].sort((a, b) => a.sortOrder - b.sortOrder)) {
    categories.set(item.category, [...(categories.get(item.category) ?? []), item]);
  }

  const statusText = status.open
    ? `Open now · until ${formatTime(status.closesAt)}`
    : status.opensAt
      ? `Closed · opens ${status.opensOn === now.date ? "today" : WEEKDAY_NAMES[new Date(`${status.opensOn}T12:00:00Z`).getUTCDay()]} ${formatTime(status.opensAt)}`
      : "Closed";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${bar.name} ${bar.address}`)}`;
  const tel = `tel:${bar.phone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="site" style={{ "--accent": bar.accentColor } as React.CSSProperties}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(barJsonLd(bar, upcoming)) }}
      />

      <header className="site-header">
        <div className="wrap header-row">
          <a href="#top" className="wordmark">{bar.name}</a>
          <span className={`status ${status.open ? "is-open" : ""}`}>{statusText}</span>
        </div>
      </header>

      <main id="top">
        <section className={`hero wrap ${bar.logoUrl ? "has-logo" : ""}`}>
          {bar.logoUrl && (
            <div className="logo-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bar.logoUrl} alt={`${bar.name} logo`} width={400} height={390} />
            </div>
          )}
          <h1>{bar.name}</h1>
          <p className="tagline">{bar.tagline}</p>
          <div className="actions">
            {bar.orderUrl && (
              <a className="button primary" href={bar.orderUrl}>Order online</a>
            )}
            <a className="button" href={tel}>Call {bar.phone}</a>
            <a className="button" href={mapsUrl}>Directions</a>
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
        </section>

        <section className="wrap" id="events" aria-labelledby="events-heading">
          <h2 id="events-heading">Coming up</h2>
          {upcoming.length === 0 ? (
            <p className="muted">Nothing on the calendar yet.</p>
          ) : (
            <ol className="events">
              {upcoming.map((e) => {
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
              })}
            </ol>
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

        {categories.size > 0 && (
          <section className="wrap" id="menu" aria-labelledby="menu-heading">
            <h2 id="menu-heading">Menu</h2>
            <div className="menu">
              {[...categories].map(([category, items]) => (
                <div key={category} className="menu-group">
                  <h3 className="eyebrow">{category}</h3>
                  <ul>
                    {items.map((item) => (
                      <li key={item.id} className={`menu-item ${item.available ? "" : "sold-out"}`}>
                        <div className="menu-line">
                          <span className="menu-name">{item.name}</span>
                          <span className="menu-dots" aria-hidden="true" />
                          <span className="menu-price">{item.available ? item.price : "Sold out"}</span>
                        </div>
                        {item.description && <p className="muted">{item.description}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="wrap" id="hours" aria-labelledby="hours-heading">
          <h2 id="hours-heading">Hours</h2>
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
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p className="wordmark">{bar.name}</p>
          <p>{bar.address}</p>
          <p><a href={tel}>{bar.phone}</a></p>
        </div>
      </footer>
    </div>
  );
}
