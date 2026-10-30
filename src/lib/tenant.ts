import { headers } from "next/headers";
import { getStore } from "./store";
import type { Bar } from "./types";

/** The bar whose site is being served, chosen by the request's domain. */
export async function getCurrentBar(): Promise<Bar | null> {
  const host = ((await headers()).get("host") ?? "").split(":")[0].toLowerCase();
  const store = await getStore();
  const bar = await store.findBar({ domain: host.replace(/^www\./, "") });
  if (bar) return bar;
  // Local development and preview deployments fall back to one bar.
  const slug = process.env.DEFAULT_BAR_SLUG;
  return slug ? store.findBar({ slug }) : null;
}
