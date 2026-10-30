import Link from "next/link";
import { requireAdminBar } from "@/lib/admin";
import { getStore } from "@/lib/store";
import { deleteMenuItem, saveMenuItem, toggleMenuItem } from "../../actions";

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const bar = await requireAdminBar();
  const { edit } = await searchParams;
  const items = (await (await getStore()).list("menuItems", bar.id)).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const editing = items.find((i) => i.id === edit);
  const categories = [...new Set(items.map((i) => i.category))];

  return (
    <>
      <section className="panel">
        <h1>{editing ? "Edit item" : "Add a menu item"}</h1>
        <form action={saveMenuItem} className="form" key={editing?.id ?? "new"}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="row">
            <div>
              <label htmlFor="name">Item</label>
              <input id="name" name="name" required placeholder="Anchor Burger" defaultValue={editing?.name} />
            </div>
            <div>
              <label htmlFor="price">Price</label>
              <input id="price" name="price" required placeholder="$14" defaultValue={editing?.price} />
            </div>
          </div>
          <label htmlFor="category">Section</label>
          <input id="category" name="category" required list="categories" placeholder="Burgers & Sandwiches" defaultValue={editing?.category} />
          <datalist id="categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
          <label htmlFor="description">Description (optional)</label>
          <textarea id="description" name="description" rows={2} defaultValue={editing?.description} />
          <div className="actions">
            <button className="button primary" type="submit">{editing ? "Save changes" : "Add item"}</button>
            {editing && <Link className="button" href="/admin/menu">Cancel</Link>}
          </div>
        </form>
      </section>

      {categories.map((category) => (
        <section key={category} className="panel">
          <h2>{category}</h2>
          <ul className="record-list">
            {items.filter((i) => i.category === category).map((item) => (
              <li key={item.id}>
                <div>
                  <strong className={item.available ? "" : "struck"}>{item.name}</strong> · {item.price}
                  {item.description && <p className="muted">{item.description}</p>}
                </div>
                <div className="record-actions">
                  <form action={toggleMenuItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="available" value={String(!item.available)} />
                    <button type="submit" className={`chip ${item.available ? "" : "chip-off"}`}>
                      {item.available ? "Available" : "Sold out"}
                    </button>
                  </form>
                  <Link className="chip" href={`/admin/menu?edit=${item.id}`}>Edit</Link>
                  <form action={deleteMenuItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="chip chip-danger">Delete</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
