import Link from "next/link";
import { requireAdminBar } from "@/lib/admin";
import { getStore } from "@/lib/store";
import { formatDate, formatTime, localNow, upcomingEvents } from "@/lib/schedule";
import { deleteEvent, saveEvent } from "../../actions";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const bar = await requireAdminBar();
  const { edit } = await searchParams;
  const events = await (await getStore()).list("events", bar.id);
  const today = localNow(new Date(), bar.timezone).date;
  const upcoming = upcomingEvents(events, today, 100);
  const editing = events.find((e) => e.id === edit);

  return (
    <>
      <section className="panel">
        <h1>{editing ? "Edit event" : "Add an event"}</h1>
        <form action={saveEvent} className="form" key={editing?.id ?? "new"}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <label htmlFor="title">What's happening</label>
          <input id="title" name="title" required placeholder="The Rusty Nails (live)" defaultValue={editing?.title} />
          <div className="row">
            <div>
              <label htmlFor="date">Date</label>
              <input id="date" name="date" type="date" required min={editing ? undefined : today} defaultValue={editing?.date ?? today} />
            </div>
            <div>
              <label htmlFor="startTime">Starts</label>
              <input id="startTime" name="startTime" type="time" required defaultValue={editing?.startTime ?? "21:00"} />
            </div>
            <div>
              <label htmlFor="endTime">Ends (optional)</label>
              <input id="endTime" name="endTime" type="time" defaultValue={editing?.endTime ?? ""} />
            </div>
          </div>
          <label htmlFor="cover">Cover (optional)</label>
          <input id="cover" name="cover" placeholder="$5 or Free" defaultValue={editing?.cover ?? ""} />
          <label htmlFor="description">Details (optional)</label>
          <textarea id="description" name="description" rows={2} defaultValue={editing?.description} />
          <div className="actions">
            <button className="button primary" type="submit">{editing ? "Save changes" : "Post event"}</button>
            {editing && <Link className="button" href="/admin/events">Cancel</Link>}
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Upcoming</h2>
        {upcoming.length === 0 && <p className="muted">No upcoming events.</p>}
        <ul className="record-list">
          {upcoming.map((e) => (
            <li key={e.id}>
              <div>
                <strong>{e.title}</strong>
                <p className="muted">
                  {formatDate(e.date)} · {formatTime(e.startTime)}
                  {e.cover ? ` · ${e.cover}` : ""}
                  {e.googlePostName ? " · On Google" : ""}
                </p>
              </div>
              <div className="record-actions">
                <Link className="chip" href={`/admin/events?edit=${e.id}`}>Edit</Link>
                <form action={deleteEvent}>
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit" className="chip chip-danger">Delete</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
