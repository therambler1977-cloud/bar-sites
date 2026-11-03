"use server";

import { revalidatePath } from "next/cache";
import { getCurrentBar } from "@/lib/tenant";
import { submitOrder } from "@/lib/orders";
import type { OrderRequest } from "@/lib/ordering";

export type PlaceOrderResult =
  | { ok: true; number: number; pickup: string; subtotal: number }
  | { ok: false; error: string };

export async function placeOrder(request: OrderRequest): Promise<PlaceOrderResult> {
  const bar = await getCurrentBar();
  if (!bar) return { ok: false, error: "Online ordering isn't open right now. Call the bar to order." };
  const result = await submitOrder(bar, request, "web");
  if (!result.ok) return result;
  revalidatePath("/admin/orders");
  return { ok: true, number: result.order.number, pickup: result.pickup, subtotal: result.order.subtotal };
}
