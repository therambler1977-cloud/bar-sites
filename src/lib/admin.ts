import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, readSessionToken } from "./auth";
import { getCurrentBar } from "./tenant";
import type { Bar } from "./types";

/** The signed-in owner's bar. Sends anyone else to the login page. */
export async function requireAdminBar(): Promise<Bar> {
  const bar = await getCurrentBar();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const barId = readSessionToken(token);
  // A session only works on the bar's own site, so one owner can't edit another bar.
  if (!bar || barId !== bar.id) redirect("/admin/login");
  return bar;
}
