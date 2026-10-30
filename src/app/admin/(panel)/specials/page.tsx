import Link from "next/link";
import { requireAdminBar } from "@/lib/admin";
import { getStore } from "@/lib/store";
import { WEEKDAY_NAMES, describeDays, formatDate, formatTime, localNow } from "@/lib/schedule";
import { deleteSpecial, saveSpecial, toggleSpecial } from "../../actions";

export default async function SpecialsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const bar = await requireAdminBar();
  const { edit } = await searchParams;
  const specials = await (await getStore()).list("specials", bar.id);
  const today = localNow(new Date(), bar.timezone).date;
  const editing = specials.find((s) => s.id === edit);
  const weekly = editing ? !editing.date : true;
  // Past one-off specials drop off the list.
  const shown = specials
    .filter((s) => !s.date || s.date >= today)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <>
      <section className="panel">
        <h1>{editing ? "Edit special" : "Add a special"}</h1>
        <form action={saveSpecial} className="form" key={editing?.id ?? "new"}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <label htmlFor="title">Name</label>
          <input id="title" name="title" required placeholder="Taco Tuesday" defaultValue={editing?.title} />
          <label htmlFor="price">Deal (optional)</label>
          <input id="price" name="price" placeholder="$2 tacos, $5 margaritas" defaultValue={editing?.price ?? ""} />

          <fieldset className="choice">
            <legend>When</legend>
            <label><input type="radio" name="repeats" value="weekly" defaultChecked={weekly} /> Every week on…</label>
            <div className="days">
              {WEEKDAY_NAMES.map((name, day) => (
                <label key={name} className="day">
                  <input type="checkbox" name="days" value={day} defaultChecked={editing?.days.includes(day as never)} />
                  {name.slice(0, 3)}
                </label>
              ))}
            </div>
            <label><input type="radio" name="repeats" value="once" defaultChecked={!weekly} /> One day only</label>
            <input aria-label="Date" name="date" type="date" defaultValue={editing?.date ?? ""} />
          </fieldset>

          <div className="row">
            <div>
              <label htmlFor="startTime">From (optional)</label>
              <input id="startTime" name="startTime" type="time" defaultValue={editing?.startTime ?? ""} />
            </div>
            <div>
              <label htmlFor="endTime">Until (optional)</label>
              <input id="endTime" name="endTime" type="time" defaultValue={editing?.endTime ?? ""} />
            </div>
          </div>
          <label htmlFor="description">Details (optional)</label>
          <textarea id="description" name="description" rows={2} defaultValue={editing?.description} />
          <div className="actions">
            <button className="button primary" type="submit">{editing ? "Save changes" : "Post special"}</button>
            {editing && <Link className="button" href="/admin/specials">Cancel</Link>}
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Your specials</h2>
        {shown.length === 0 && <p className="muted">No specials yet.</p>}
        <ul className="record-list">
          {shown.map((s) => (
            <li key={s.id} className={s.active ? "" : "is-paused"}>
              <div>
                <strong>{s.title}</strong>{s.price ? ` · ${s.price}` : ""}
                <p className="muted">
                  {s.date ? formatDate(s.date) : describeDays(s.days)}
                  {s.startTime ? ` · ${formatTime(s.startTime)}` : ""}
                  {s.endTime ? `–${formatTime(s.endTime)}` : ""}
                  {s.active ? "" : " · Paused"}
                </p>
              </div>
              <div className="record-actions">
                <form action={toggleSpecial}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="active" value={String(!s.active)} />
                  <button type="submit" className="chip">{s.active ? "Pause" : "Resume"}</button>
                </form>
                <Link className="chip" href={`/admin/specials?edit=${s.id}`}>Edit</Link>
                <form action={deleteSpecial}>
                  <input type="hidden" name="id" value={s.id} />
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
