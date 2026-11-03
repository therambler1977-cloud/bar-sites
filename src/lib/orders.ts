// Placing an order, shared by the website checkout and the voice assistant.

import { getStore } from "./store";
import { localNow } from "./schedule";
import { checkOrder, nextOrderNumber, pickupDays, pickupLabel, type OrderRequest } from "./ordering";
import { sendToPos } from "./pos";
import type { Bar, Order } from "./types";

export type SubmitResult =
  | { ok: true; order: Order; pickup: string }
  | { ok: false; error: string };

export async function submitOrder(bar: Bar, request: OrderRequest, source: Order["source"] = "web"): Promise<SubmitResult> {
  if (!bar.onlineOrdering) return { ok: false, error: "Online ordering isn't open right now. Call the bar to order." };
  const store = await getStore();
  const [menu, overrides, existing] = await Promise.all([
    store.list("menuItems", bar.id),
    store.list("hoursOverrides", bar.id),
    store.list("orders", bar.id),
  ]);
  const days = pickupDays(bar, overrides, localNow(new Date(), bar.timezone));
  const check = checkOrder(bar.id, request, menu, days);
  if (!check.ok) return check;

  const order = await store.create("orders", {
    ...check.order,
    source,
    number: nextOrderNumber(existing),
    createdAt: new Date().toISOString(),
  });
  const posOrderId = await sendToPos(bar, order).catch((error) => {
    console.error("Sending the order to the POS failed", error);
    return null;
  });
  if (posOrderId) await store.update("orders", bar.id, order.id, { posOrderId });
  return { ok: true, order, pickup: pickupLabel(days, order.pickupDate, order.pickupTime) };
}
