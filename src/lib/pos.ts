// Sends a placed order on to the bar's point of sale, so staff don't re-key it.

import type { Bar, Order } from "./types";

/**
 * Returns the order's id in the POS, or null when the bar has no POS hookup
 * (demo mode: the order lives only on the site's Orders screen).
 */
export async function sendToPos(bar: Bar, order: Order): Promise<string | null> {
  if (bar.onlineOrdering !== "clover") return null;
  // Next step: create the order with Clover's REST API (sandbox first):
  // POST /v3/merchants/{mId}/orders, then add line items, using a merchant
  // access token stored for the bar. Until that's connected, keep the order on the site.
  console.warn(`Clover isn't connected yet for ${bar.slug}; order ${order.number} stays on the site.`);
  return null;
}
