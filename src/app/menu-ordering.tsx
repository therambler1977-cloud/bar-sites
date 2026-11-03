"use client";

// The menu, with Add buttons and a checkout when the bar takes orders on the site.
// The cart lives in the browser until checkout; the server re-checks every price.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { MenuItem } from "@/lib/types";
import { formatCents, parsePrice, type PickupDay } from "@/lib/ordering";
import { placeOrder, type PlaceOrderResult } from "./order-actions";

type Cart = Record<string, number>;

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

function loadCart(key: string): Cart {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Cart) : {};
  } catch {
    return {};
  }
}

function saveCart(key: string, cart: Cart) {
  try {
    window.localStorage.setItem(key, JSON.stringify(cart));
  } catch {
    // Private browsing or blocked storage: the cart just won't survive a reload.
  }
}

export function MenuOrdering({
  categories,
  ordering,
}: {
  categories: [string, MenuItem[]][];
  ordering: { storageKey: string; days: PickupDay[]; barName: string; address: string } | null;
}) {
  const items = useMemo(() => categories.flatMap(([, list]) => list), [categories]);
  const orderable = (item: MenuItem) => ordering !== null && item.available && parsePrice(item.price) !== null;

  const [cart, setCart] = useState<Cart>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!ordering) return;
    const saved = loadCart(ordering.storageKey);
    // Drop anything that has sold out or left the menu since the cart was saved.
    const valid = Object.fromEntries(
      Object.entries(saved).filter(([id, qty]) => {
        const item = items.find((i) => i.id === id);
        return item && orderable(item) && qty > 0;
      }),
    );
    setCart(valid);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordering?.storageKey, items]);
  useEffect(() => {
    if (ordering && loaded) saveCart(ordering.storageKey, cart);
  }, [cart, loaded, ordering]);

  const setQty = (id: string, qty: number) =>
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(20, qty);
      return next;
    });

  const lines = Object.entries(cart)
    .map(([id, quantity]) => {
      const item = items.find((i) => i.id === id);
      return item ? { item, quantity, unit: parsePrice(item.price) ?? 0 } : null;
    })
    .filter((l): l is { item: MenuItem; quantity: number; unit: number } => l !== null);
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = lines.reduce((n, l) => n + l.unit * l.quantity, 0);

  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<PlaceOrderResult | null>(null);
  const [pending, startTransition] = useTransition();
  const days = ordering?.days ?? [];
  const [pickupDate, setPickupDate] = useState(days[0]?.date ?? "");
  const pickupTimes = days.find((d) => d.date === pickupDate)?.times ?? [];

  function openCheckout() {
    setResult(null);
    if (!days.some((d) => d.date === pickupDate)) setPickupDate(days[0]?.date ?? "");
    dialog.current?.showModal();
  }

  function submit(form: FormData) {
    startTransition(async () => {
      const res = await placeOrder({
        lines: lines.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity })),
        customerName: String(form.get("name") ?? ""),
        customerPhone: String(form.get("phone") ?? ""),
        pickupDate: String(form.get("pickupDate") ?? ""),
        pickupTime: String(form.get("pickupTime") ?? ""),
        notes: String(form.get("notes") ?? ""),
      });
      setResult(res);
      if (res.ok) setCart({});
    });
  }

  return (
    <>
      {ordering && (
        <p className="order-intro">
          {days.length > 0
            ? "Order ahead for pickup. Tap Add on anything below, and pay when you pick it up."
            : "Online ordering is closed right now. Call the bar to order."}
        </p>
      )}
      {categories.length > 2 && (
        <nav className="chips menu-chips" aria-label="Menu sections">
          {categories.map(([category]) => (
            <a key={category} className="chip-button" href={`#menu-${slug(category)}`}>{category}</a>
          ))}
        </nav>
      )}
      <div className="menu">
        {categories.map(([category, list]) => (
          <div key={category} className="menu-group" id={`menu-${slug(category)}`}>
            <h3 className="eyebrow">{category}</h3>
            <ul>
              {list.map((item) => {
                const qty = cart[item.id] ?? 0;
                return (
                  <li key={item.id} className={`menu-item ${item.available ? "" : "sold-out"}`}>
                    <div className="menu-line">
                      <span className="menu-name">{item.name}</span>
                      <span className="menu-dots" aria-hidden="true" />
                      <span className="menu-price">{item.available ? item.price : "Sold out"}</span>
                    </div>
                    {item.description && <p className="muted">{item.description}</p>}
                    {orderable(item) && days.length > 0 && (
                      <div className="menu-order">
                        {qty === 0 ? (
                          <button type="button" className="add-button" onClick={() => setQty(item.id, 1)} aria-label={`Add ${item.name} to your order`}>
                            Add
                          </button>
                        ) : (
                          <Stepper name={item.name} qty={qty} onChange={(q) => setQty(item.id, q)} />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {ordering && count > 0 && (
        <button type="button" className="cart-bar" onClick={openCheckout}>
          <span>View order · {count} {count === 1 ? "item" : "items"}</span>
          <strong>{formatCents(subtotal)}</strong>
        </button>
      )}

      {ordering && (
        <dialog ref={dialog} className="checkout" aria-labelledby="checkout-heading">
          <button type="button" className="checkout-close" onClick={() => dialog.current?.close()} aria-label="Close">×</button>
          {result?.ok ? (
            <div className="checkout-done">
              <p className="eyebrow">Order placed</p>
              <h2 id="checkout-heading">Order #{result.number} is in</h2>
              <p>
                Pick it up <strong>{result.pickup.replace(/^Today/, "today").replace(/^Tomorrow/, "tomorrow")}</strong> at{" "}
                {ordering.barName}, {ordering.address.split(",")[0]}.
              </p>
              <p>Pay {formatCents(result.subtotal)} plus tax when you pick it up.</p>
              <button type="button" className="button primary" onClick={() => dialog.current?.close()}>Done</button>
            </div>
          ) : (
            <form action={submit}>
              <h2 id="checkout-heading">Your order</h2>
              {lines.length === 0 ? (
                <p className="muted">Your order is empty. Tap Add on the menu to start one.</p>
              ) : (
                <ul className="checkout-lines">
                  {lines.map((l) => (
                    <li key={l.item.id}>
                      <span className="checkout-name">{l.item.name}</span>
                      <Stepper name={l.item.name} qty={l.quantity} onChange={(q) => setQty(l.item.id, q)} />
                      <span className="checkout-price">{formatCents(l.unit * l.quantity)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="checkout-total"><span>Subtotal</span><strong>{formatCents(subtotal)}</strong></p>

              <div className="checkout-fields">
                <label>
                  Name
                  <input name="name" autoComplete="name" required maxLength={60} />
                </label>
                <label>
                  Phone
                  <input name="phone" type="tel" autoComplete="tel" inputMode="tel" required placeholder="(708) 555-0123" />
                </label>
                <label>
                  Pickup day
                  <select name="pickupDate" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)}>
                    {days.map((d) => <option key={d.date} value={d.date}>{d.label}</option>)}
                  </select>
                </label>
                <label>
                  Pickup time
                  <select name="pickupTime" key={pickupDate}>
                    {pickupTimes.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                  </select>
                </label>
                <label className="checkout-wide">
                  Notes for the kitchen (optional)
                  <textarea name="notes" rows={2} maxLength={300} placeholder="Hot giardiniera, extra au jus…" />
                </label>
              </div>

              {result && !result.ok && <p className="checkout-error" role="alert">{result.error}</p>}
              <button type="submit" className="button primary checkout-submit" disabled={pending || lines.length === 0}>
                {pending ? "Placing order…" : `Place order · ${formatCents(subtotal)}`}
              </button>
              <p className="muted checkout-fine">You'll pay at the bar when you pick up. Tax is added there.</p>
            </form>
          )}
        </dialog>
      )}
    </>
  );
}

function Stepper({ name, qty, onChange }: { name: string; qty: number; onChange: (qty: number) => void }) {
  return (
    <span className="stepper">
      <button type="button" onClick={() => onChange(qty - 1)} aria-label={`One fewer ${name}`}>−</button>
      <span aria-live="polite" aria-label={`${qty} ${name}`}>{qty}</span>
      <button type="button" onClick={() => onChange(qty + 1)} disabled={qty >= 20} aria-label={`One more ${name}`}>+</button>
    </span>
  );
}
