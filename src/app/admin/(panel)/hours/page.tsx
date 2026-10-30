import { requireAdminBar } from "@/lib/admin";
import { getStore } from "@/lib/store";
import { WEEKDAY_NAMES, formatDate, formatTime, localNow } from "@/lib/schedule";
import type { Weekday } from "@/lib/types";
import { deleteHoursOverride, saveHoursOverride, saveWeeklyHours } from "../../actions";

// Monday first, the way owners think about the week.
const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export default async function HoursPage() {
  const bar = await requireAdminBar();
  const overrides = await (await getStore()).list("hoursOverrides", bar.id);
  const today = localNow(new Date(), bar.timezone).date;
  const upcoming = overrides
    .filter((o) => o.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <section className="panel">
        <h1>Holiday or one-off hours</h1>
        <p className="muted">Closing early, opening late, or closed for a day. Updates your site and Google.</p>
        <form action={saveHoursOverride} className="form">
          <label htmlFor="date">Date</label>
          <input id="date" name="date" type="date" required min={today} />
          <fieldset className="choice">
            <legend>Hours that day</legend>
            <label><input type="radio" name="closed" value="true" defaultChecked /> Closed all day</label>
            <label><input type="radio" name="closed" value="false" /> Open special hours:</label>
            <div className="row">
              <input aria-label="Opens" name="open" type="time" />
              <input aria-label="Closes" name="close" type="time" />
            </div>
          </fieldset>
          <label htmlFor="note">Reason (optional)</label>
          <input id="note" name="note" placeholder="Thanksgiving" />
          <div className="actions">
            <button className="button primary" type="submit">Save</button>
          </div>
        </form>
        {upcoming.length > 0 && (
          <ul className="record-list">
            {upcoming.map((o) => (
              <li key={o.id}>
                <div>
                  <strong>{formatDate(o.date)}</strong>
                  <p className="muted">
                    {o.closed ? "Closed" : `${formatTime(o.open ?? "")}–${formatTime(o.close ?? "")}`}
                    {o.note ? ` · ${o.note}` : ""}
                  </p>
                </div>
                <form action={deleteHoursOverride}>
                  <input type="hidden" name="id" value={o.id} />
                  <button type="submit" className="chip chip-danger">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Regular weekly hours</h2>
        <form action={saveWeeklyHours} className="form">
          <table className="hours-edit">
            <tbody>
              {WEEK.map((day) => {
                const hours = bar.weeklyHours[day];
                return (
                  <tr key={day}>
                    <th scope="row">
                      <label>
                        <input type="checkbox" name={`openDay-${day}`} defaultChecked={Boolean(hours)} />{" "}
                        {WEEKDAY_NAMES[day].slice(0, 3)}
                      </label>
                    </th>
                    <td><input aria-label={`${WEEKDAY_NAMES[day]} opens`} name={`open-${day}`} type="time" defaultValue={hours?.open ?? ""} /></td>
                    <td><input aria-label={`${WEEKDAY_NAMES[day]} closes`} name={`close-${day}`} type="time" defaultValue={hours?.close ?? ""} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted">Unchecked days show as closed. A closing time after midnight is fine.</p>
          <div className="actions">
            <button className="button primary" type="submit">Save hours</button>
          </div>
        </form>
      </section>
    </>
  );
}
