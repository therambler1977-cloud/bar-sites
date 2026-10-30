"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, createSessionToken, verifyPassword } from "@/lib/auth";
import { requireAdminBar } from "@/lib/admin";
import { getCurrentBar } from "@/lib/tenant";
import { getStore } from "@/lib/store";
import { addEvent, addSpecial, removeHoursOverride, setHoursOverride } from "@/lib/publish";
import type { DayHours, Weekday } from "@/lib/types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => text(form, key) || null;

function done(path: string): never {
  revalidatePath("/");
  revalidatePath(path);
  redirect(path);
}

export async function login(_state: string | null, form: FormData): Promise<string | null> {
  const bar = await getCurrentBar();
  if (!bar || !verifyPassword(text(form, "password"), bar.adminPasswordHash)) {
    return "That password didn't work. Try again.";
  }
  (await cookies()).set(SESSION_COOKIE, createSessionToken(bar.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}

export async function saveEvent(form: FormData) {
  const bar = await requireAdminBar();
  const store = await getStore();
  const input = {
    title: text(form, "title"),
    date: text(form, "date"),
    startTime: text(form, "startTime"),
    endTime: optional(form, "endTime"),
    description: text(form, "description"),
    cover: optional(form, "cover"),
  };
  const id = text(form, "id");
  if (id) await store.update("events", bar.id, id, input);
  else await addEvent(store, bar, input);
  done("/admin/events");
}

export async function deleteEvent(form: FormData) {
  const bar = await requireAdminBar();
  await (await getStore()).remove("events", bar.id, text(form, "id"));
  done("/admin/events");
}

export async function saveSpecial(form: FormData) {
  const bar = await requireAdminBar();
  const store = await getStore();
  const repeats = text(form, "repeats") === "weekly";
  const input = {
    title: text(form, "title"),
    description: text(form, "description"),
    price: optional(form, "price"),
    days: repeats ? (form.getAll("days").map(Number) as Weekday[]) : [],
    date: repeats ? null : optional(form, "date"),
    startTime: optional(form, "startTime"),
    endTime: optional(form, "endTime"),
  };
  const id = text(form, "id");
  if (id) await store.update("specials", bar.id, id, input);
  else await addSpecial(store, bar, input);
  done("/admin/specials");
}

export async function toggleSpecial(form: FormData) {
  const bar = await requireAdminBar();
  await (await getStore()).update("specials", bar.id, text(form, "id"), {
    active: text(form, "active") === "true",
  });
  done("/admin/specials");
}

export async function deleteSpecial(form: FormData) {
  const bar = await requireAdminBar();
  await (await getStore()).remove("specials", bar.id, text(form, "id"));
  done("/admin/specials");
}

export async function saveMenuItem(form: FormData) {
  const bar = await requireAdminBar();
  const store = await getStore();
  const input = {
    category: text(form, "category"),
    name: text(form, "name"),
    description: text(form, "description"),
    price: text(form, "price"),
  };
  const id = text(form, "id");
  if (id) {
    await store.update("menuItems", bar.id, id, input);
  } else {
    const count = (await store.list("menuItems", bar.id)).length;
    await store.create("menuItems", { ...input, barId: bar.id, available: true, sortOrder: count });
  }
  done("/admin/menu");
}

/** The one-tap "86 it" switch, used on the dashboard and the menu page. */
export async function toggleMenuItem(form: FormData) {
  const bar = await requireAdminBar();
  await (await getStore()).update("menuItems", bar.id, text(form, "id"), {
    available: text(form, "available") === "true",
  });
  done(text(form, "back") || "/admin/menu");
}

export async function deleteMenuItem(form: FormData) {
  const bar = await requireAdminBar();
  await (await getStore()).remove("menuItems", bar.id, text(form, "id"));
  done("/admin/menu");
}

export async function saveWeeklyHours(form: FormData) {
  const bar = await requireAdminBar();
  const weeklyHours: Partial<Record<Weekday, DayHours>> = {};
  for (let day = 0; day < 7; day++) {
    const open = text(form, `open-${day}`);
    const close = text(form, `close-${day}`);
    if (form.get(`openDay-${day}`) && open && close) weeklyHours[day as Weekday] = { open, close };
  }
  await (await getStore()).updateBar(bar.id, { weeklyHours });
  done("/admin/hours");
}

export async function saveHoursOverride(form: FormData) {
  const bar = await requireAdminBar();
  const closed = text(form, "closed") === "true";
  await setHoursOverride(await getStore(), bar, {
    date: text(form, "date"),
    closed,
    open: closed ? null : optional(form, "open"),
    close: closed ? null : optional(form, "close"),
    note: text(form, "note"),
  });
  done("/admin/hours");
}

export async function deleteHoursOverride(form: FormData) {
  const bar = await requireAdminBar();
  await removeHoursOverride(await getStore(), bar, text(form, "id"));
  done("/admin/hours");
}
