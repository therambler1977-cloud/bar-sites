import { requireAdminBar } from "@/lib/admin";
import { getStore } from "@/lib/store";
import { formatTime, localNow } from "@/lib/schedule";
import { formatCents } from "@/lib/ordering";
import type { Order, OrderStatus } from "@/lib/types";
import { setOrderStatus } from "../../actions";
import { AutoRefresh } from "./auto-refresh";

const GROUPS: { status: OrderStatus; title: string; empty: string; next?: { status: OrderStatus; label: string } }[] = [
  { status: "new", title: "New", empty: "No new orders. They'll show up here as they come in.", next: { status: "ready", label: "Mark ready" } },
  { status: "ready", title: "Ready for pickup", empty: "Nothing waiting on the shelf.", next: { status: "picked_up", label: "Picked up" } },
  { status: "picked_up", title: "Picked up today", empty: "None yet today." },
];

function placedAgo(iso: string, now: Date) {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60} min ago`;
}

export default async function OrdersPage() {
  const bar = await requireAdminBar();
  const orders = await (await getStore()).list("orders", bar.id);
  const nowDate = new Date();
  const today = localNow(nowDate, bar.timezone).date;
  // Soonest pickup first, so the kitchen works top to bottom.
  const sorted = [...orders].sort((a, b) =>
    (a.pickupDate + a.pickupTime + a.createdAt).localeCompare(b.pickupDate + b.pickupTime + b.createdAt),
  );

  return (
    <>
      <AutoRefresh />
      <section className="panel">
        <h1>Orders</h1>
        {bar.onlineOrdering === "demo" ? (
          <p className="muted">
            Demo mode: guests pay at pickup and orders show only here. Connecting Clover will send them
            straight to your POS too. This page updates on its own.
          </p>
        ) : !bar.onlineOrdering ? (
          <p className="muted">Online ordering is off for this site.</p>
        ) : (
          <p className="muted">Orders also go to your Clover POS. This page updates on its own.</p>
        )}
      </section>

      {GROUPS.map((group) => {
        const list = sorted.filter(
          (o) => o.status === group.status && (group.status !== "picked_up" || o.pickupDate === today),
        );
        return (
          <section key={group.status} className="panel">
            <h2>{group.title}{list.length > 0 ? ` (${list.length})` : ""}</h2>
            {list.length === 0 ? (
              <p className="muted">{group.empty}</p>
            ) : (
              <ul className="order-list">
                {list.map((order) => (
                  <OrderCard key={order.id} order={order} today={today} now={nowDate} next={group.next} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

function OrderCard({
  order,
  today,
  now,
  next,
}: {
  order: Order;
  today: string;
  now: Date;
  next?: { status: OrderStatus; label: string };
}) {
  const day = order.pickupDate === today ? "Today" : order.pickupDate;
  return (
    <li className={`order-card order-${order.status}`}>
      <div className="order-head">
        <strong className="order-number">#{order.number}</strong>
        <span>{order.customerName}</span>
        <span className="order-pickup">Pickup {day} {formatTime(order.pickupTime)}</span>
      </div>
      <ul className="order-lines">
        {order.lines.map((line) => (
          <li key={line.menuItemId}>
            <span>{line.quantity} × {line.name}</span>
            <span>{formatCents(line.unitPrice * line.quantity)}</span>
          </li>
        ))}
      </ul>
      {order.notes && <p className="order-notes">Note: {order.notes}</p>}
      <div className="order-foot">
        <span className="muted">
          {formatCents(order.subtotal)} due at pickup · <a href={`tel:${order.customerPhone.replace(/\D/g, "")}`}>{order.customerPhone}</a> · placed {placedAgo(order.createdAt, now)}
        </span>
        {next && (
          <form action={setOrderStatus}>
            <input type="hidden" name="id" value={order.id} />
            <input type="hidden" name="status" value={next.status} />
            <button type="submit" className="button primary">{next.label}</button>
          </form>
        )}
      </div>
    </li>
  );
}
