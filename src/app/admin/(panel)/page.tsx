import Link from "next/link";
import { requireAdminBar } from "@/lib/admin";
import { getStore } from "@/lib/store";
import {
  WEEKDAY_NAMES,
  formatTime,
  hoursOn,
  localNow,
  specialsOn,
  upcomingEvents,
} from "@/lib/schedule";
import { toggleMenuItem } from "../actions";

function formatPhone(e164: string) {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export default async function Dashboard() {
  const bar = await requireAdminBar();
  const store = await getStore();
  const [events, specials, menu, overrides] = await Promise.all([
    store.list("events", bar.id),
    store.list("specials", bar.id),
    store.list("menuItems", bar.id),
    store.list("hoursOverrides", bar.id),
  ]);
  const now = localNow(new Date(), bar.timezone);
  const hours = hoursOn(bar, overrides, now.date);
  const tonight = upcomingEvents(events, now.date).filter((e) => e.date === now.date);
  const todays = specialsOn(specials, now.date);
  const items = [...menu].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <section className="panel">
        <p className="eyebrow">{WEEKDAY_NAMES[now.weekday]}</p>
        <h1>Today on your site</h1>
        <p>{hours ? `Open ${formatTime(hours.open)}–${formatTime(hours.close)}` : "Closed today"}</p>
        <ul className="plain-list">
          {tonight.map((e) => (
            <li key={e.id}>{formatTime(e.startTime)} · {e.title}</li>
          ))}
          {todays.map((s) => (
            <li key={s.id}>{s.title}{s.price ? ` · ${s.price}` : ""}</li>
          ))}
          {tonight.length + todays.length === 0 && <li className="muted">No events or specials today.</li>}
        </ul>
        <div className="actions">
          <Link className="button primary" href="/admin/events">Add event</Link>
          <Link className="button" href="/admin/specials">Add special</Link>
        </div>
      </section>

      {bar.smsNumber && (
        <section className="panel tip">
          <h2>Faster: just text it</h2>
          <p>
            Text updates to <strong>{formatPhone(bar.smsNumber)}</strong>, like “Fri 9pm The Rusty Nails, $5 cover”
            or “out of wings”. You'll get a preview, and nothing posts until you reply YES.
          </p>
        </section>
      )}

      <section className="panel">
        <h2>Sold out? Tap to 86 it</h2>
        <ul className="toggle-list">
          {items.map((item) => (
            <li key={item.id}>
              <span className={item.available ? "" : "struck"}>{item.name}</span>
              <form action={toggleMenuItem}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="available" value={String(!item.available)} />
                <input type="hidden" name="back" value="/admin" />
                <button type="submit" className={`chip ${item.available ? "" : "chip-off"}`}>
                  {item.available ? "Available" : "Sold out"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
