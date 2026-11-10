import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Bar,
  BarEvent,
  HoursOverride,
  MenuItem,
  Order,
  PendingUpdate,
  Special,
} from "./types";
import { seedData } from "./seed";

export interface Collections {
  events: BarEvent;
  specials: Special;
  menuItems: MenuItem;
  hoursOverrides: HoursOverride;
  pendingUpdates: PendingUpdate;
  orders: Order;
}
export type CollectionName = keyof Collections;
type NewRecord<K extends CollectionName> = Omit<Collections[K], "id">;

type BarLookup =
  | { slug: string }
  | { id: string }
  | { domain: string }
  | { smsNumber: string };

export interface Store {
  findBar(by: BarLookup): Promise<Bar | null>;
  updateBar(id: string, patch: Partial<Omit<Bar, "id">>): Promise<Bar>;
  list<K extends CollectionName>(collection: K, barId: string): Promise<Collections[K][]>;
  create<K extends CollectionName>(collection: K, value: NewRecord<K>): Promise<Collections[K]>;
  update<K extends CollectionName>(
    collection: K,
    barId: string,
    id: string,
    patch: Partial<NewRecord<K>>,
  ): Promise<Collections[K]>;
  remove(collection: CollectionName, barId: string, id: string): Promise<void>;
}

export interface Database {
  bars: Bar[];
  events: BarEvent[];
  specials: Special[];
  menuItems: MenuItem[];
  hoursOverrides: HoursOverride[];
  pendingUpdates: PendingUpdate[];
  orders?: Order[]; // missing in demo files saved before ordering existed
}

function matchesBar(bar: Bar, by: BarLookup): boolean {
  if ("slug" in by) return bar.slug === by.slug;
  if ("id" in by) return bar.id === by.id;
  if ("domain" in by) return bar.domains.includes(by.domain.toLowerCase());
  return bar.smsNumber === by.smsNumber;
}

/** Keeps everything in memory, optionally saved to a JSON file. Used for demos and tests. */
export class MemoryStore implements Store {
  constructor(
    private db: Database,
    private persist: ((db: Database) => Promise<void>) | null = null,
  ) {
    db.orders ??= [];
  }

  private async save() {
    await this.persist?.(this.db);
  }

  async findBar(by: BarLookup) {
    return this.db.bars.find((b) => matchesBar(b, by)) ?? null;
  }

  async updateBar(id: string, patch: Partial<Omit<Bar, "id">>) {
    const bar = this.db.bars.find((b) => b.id === id);
    if (!bar) throw new Error(`No bar ${id}`);
    Object.assign(bar, patch);
    await this.save();
    return bar;
  }

  async list<K extends CollectionName>(collection: K, barId: string) {
    const rows = this.db[collection] as Collections[K][];
    return rows.filter((r) => r.barId === barId);
  }

  async create<K extends CollectionName>(collection: K, value: NewRecord<K>) {
    const record = { ...value, id: randomUUID() } as Collections[K];
    (this.db[collection] as Collections[K][]).push(record);
    await this.save();
    return record;
  }

  async update<K extends CollectionName>(
    collection: K,
    barId: string,
    id: string,
    patch: Partial<NewRecord<K>>,
  ) {
    const rows = this.db[collection] as Collections[K][];
    const record = rows.find((r) => r.id === id && r.barId === barId);
    if (!record) throw new Error(`No ${collection} record ${id}`);
    Object.assign(record, patch);
    await this.save();
    return record;
  }

  async remove(collection: CollectionName, barId: string, id: string) {
    const rows = this.db[collection] as { id: string; barId: string }[];
    const index = rows.findIndex((r) => r.id === id && r.barId === barId);
    if (index >= 0) rows.splice(index, 1);
    await this.save();
  }
}

// Supabase uses snake_case columns; the app uses camelCase.
const TABLES: Record<CollectionName, string> = {
  events: "events",
  specials: "specials",
  menuItems: "menu_items",
  hoursOverrides: "hours_overrides",
  pendingUpdates: "pending_updates",
  orders: "orders",
};

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function mapKeys(row: Record<string, unknown>, fn: (k: string) => string) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [fn(k), v]));
}

export class SupabaseStore implements Store {
  constructor(private client: SupabaseClient) {}

  async findBar(by: BarLookup) {
    let query = this.client.from("bars").select("*");
    if ("slug" in by) query = query.eq("slug", by.slug);
    else if ("id" in by) query = query.eq("id", by.id);
    else if ("domain" in by) query = query.contains("domains", [by.domain.toLowerCase()]);
    else query = query.eq("sms_number", by.smsNumber);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? (mapKeys(data, toCamel) as unknown as Bar) : null;
  }

  async updateBar(id: string, patch: Partial<Omit<Bar, "id">>) {
    const { data, error } = await this.client
      .from("bars")
      .update(mapKeys(patch, toSnake))
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return mapKeys(data, toCamel) as unknown as Bar;
  }

  async list<K extends CollectionName>(collection: K, barId: string) {
    const { data, error } = await this.client
      .from(TABLES[collection])
      .select("*")
      .eq("bar_id", barId);
    if (error) throw error;
    return (data ?? []).map((r) => mapKeys(r, toCamel)) as unknown as Collections[K][];
  }

  async create<K extends CollectionName>(collection: K, value: NewRecord<K>) {
    const { data, error } = await this.client
      .from(TABLES[collection])
      .insert(mapKeys(value as Record<string, unknown>, toSnake))
      .select()
      .single();
    if (error) throw error;
    return mapKeys(data, toCamel) as unknown as Collections[K];
  }

  async update<K extends CollectionName>(
    collection: K,
    barId: string,
    id: string,
    patch: Partial<NewRecord<K>>,
  ) {
    const { data, error } = await this.client
      .from(TABLES[collection])
      .update(mapKeys(patch as Record<string, unknown>, toSnake))
      .eq("id", id)
      .eq("bar_id", barId)
      .select()
      .single();
    if (error) throw error;
    return mapKeys(data, toCamel) as unknown as Collections[K];
  }

  async remove(collection: CollectionName, barId: string, id: string) {
    const { error } = await this.client
      .from(TABLES[collection])
      .delete()
      .eq("id", id)
      .eq("bar_id", barId);
    if (error) throw error;
  }
}

let supabaseStore: Store | null = null;

/**
 * Keeps the whole demo database as one JSON value in Redis (Upstash, added to the
 * Vercel project from its Storage tab), so admin edits survive restarts and every
 * server instance sees the same data. Uses the REST API, so no extra package.
 */
export function redisConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

const REDIS_KEY = "bar-sites:db";

async function redis(config: { url: string; token: string }, command: string[]): Promise<unknown> {
  const res = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || body.error) throw new Error(`Redis ${command[0]} failed: ${body.error ?? res.status}`);
  return body.result;
}

/**
 * True when admin edits only live in one server instance's temp folder (Vercel with
 * no database connected), so they can vanish or not show up. The admin warns about it.
 */
export function editsMayNotStick(): boolean {
  return Boolean(process.env.VERCEL) && !redisConfig() && !process.env.SUPABASE_URL;
}

/** Supabase when configured, then Redis, otherwise a local demo database in .data/db.json. */
export async function getStore(): Promise<Store> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    supabaseStore ??= new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
    return supabaseStore;
  }
  const kv = redisConfig();
  if (kv) {
    const save = async (db: Database) => {
      await redis(kv, ["SET", REDIS_KEY, JSON.stringify(db)]);
    };
    const saved = await redis(kv, ["GET", REDIS_KEY]);
    if (typeof saved === "string") return new MemoryStore(JSON.parse(saved), save);
    const db = seedData();
    await save(db);
    return new MemoryStore(db, save);
  }
  // Re-read the file on every request: Next.js may serve pages and actions from
  // separate workers, and each must see the others' writes.
  // Vercel's filesystem is read-only apart from the temp folder, which each server
  // instance has its own copy of. Without Redis or Supabase, edits made there can land
  // in one instance and not show up in the next request, or reset on restart.
  const dir = process.env.VERCEL ? path.join(os.tmpdir(), "bar-sites") : path.join(process.cwd(), ".data");
  const file = path.join(dir, "db.json");
  const save = async (db: Database) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(db, null, 2));
  };
  try {
    return new MemoryStore(JSON.parse(await fs.readFile(file, "utf8")), save);
  } catch {
    const db = seedData();
    await save(db);
    return new MemoryStore(db, save);
  }
}
