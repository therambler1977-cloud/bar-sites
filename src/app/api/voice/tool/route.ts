// Vapi calls this when the voice assistant uses a tool (placing a pickup order).
// Orders get the same checks as the website checkout, so this is no more open than that.

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentBar } from "@/lib/tenant";
import { getStore } from "@/lib/store";
import { localNow } from "@/lib/schedule";
import { formatCents, pickupDays } from "@/lib/ordering";
import { submitOrder } from "@/lib/orders";
import { ORDER_TOOL, voiceOrderRequest, type VoiceOrderArgs } from "@/lib/voice";

interface ToolCall {
  id: string;
  function?: { name?: string; arguments?: string | Record<string, unknown> };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { message?: { type?: string; toolCallList?: ToolCall[] } } | null;
  const calls = body?.message?.toolCallList ?? [];
  const bar = await getCurrentBar();

  const results = [];
  for (const call of calls) {
    const name = call.function?.name ?? "";
    let result: string;
    if (!bar) result = "The bar's system isn't available. Ask them to call the bar.";
    else if (name !== ORDER_TOOL) result = `Unknown tool ${name}.`;
    else {
      const raw = call.function?.arguments ?? {};
      const args = (typeof raw === "string" ? JSON.parse(raw || "{}") : raw) as VoiceOrderArgs;
      result = await placeVoiceOrder(bar, args);
    }
    results.push({ toolCallId: call.id, name, result });
  }
  return NextResponse.json({ results });
}

async function placeVoiceOrder(bar: NonNullable<Awaited<ReturnType<typeof getCurrentBar>>>, args: VoiceOrderArgs) {
  const store = await getStore();
  const [menu, overrides] = await Promise.all([store.list("menuItems", bar.id), store.list("hoursOverrides", bar.id)]);
  const days = pickupDays(bar, overrides, localNow(new Date(), bar.timezone));
  const built = voiceOrderRequest(args, menu, days);
  if ("error" in built) return `Not placed: ${built.error}`;
  const placed = await submitOrder(bar, built.request!, "voice");
  if (!placed.ok) return `Not placed: ${placed.error}`;
  revalidatePath("/admin/orders");
  return `Placed. Order number ${placed.order.number}, pickup ${placed.pickup}, total ${formatCents(placed.order.subtotal)} plus tax, paid at pickup.`;
}
