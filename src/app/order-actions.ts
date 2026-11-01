"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBar } from "@/lib/tenant";
import { getStore } from "@/lib/store";
import { localNow } from "@/lib/schedule";
import { checkOrder, nextOrderNumber, pickupDays, pickupLabel, type OrderRequest } from "@/lib/ordering";
import { sendToPos } from "@/lib/pos";

export type PlaceOrderResult =
  | { ok: true; number: number; pickup: string; subtotal: number }
  | { ok: false; error: string };

export async function placeOrder(request: OrderRequest): Promise<PlaceOrderResult> {
  const bar = await getCurrentBar();
  if (!bar?.onlineOrdering) return { ok: false, error: "Online ordering isn't open right now. Call the bar to order." };

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
    number: nextOrderNumber(existing),
    createdAt: new Date().toISOString(),
  });
  const posOrderId = await sendToPos(bar, order).catch((error) => {
    console.error("Sending the order to the POS failed", error);
    return null;
  });
  if (posOrderId) await store.update("orders", bar.id, order.id, { posOrderId });

  revalidatePath("/admin/orders");
  return {
    ok: true,
    number: order.number,
    pickup: pickupLabel(days, order.pickupDate, order.pickupTime),
    subtotal: order.subtotal,
  };
}
