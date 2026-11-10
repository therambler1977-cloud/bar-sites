import type { Database } from "./store";

/**
 * Brings changes made to the seed data in the repo (new events, a band's genre, a menu
 * fix) into a saved demo database, without undoing admin edits.
 *
 * `previous` is the seed the saved database was last synced with. Field by field, a
 * saved value that still matches it was never edited, so it takes the new seed's value;
 * anything else was edited in the admin and is kept. New seed records are added, and
 * records the admin deleted stay deleted. Records the seed dropped are removed unless
 * they were edited.
 *
 * With no `previous` (a database saved before syncing existed), every saved value is
 * treated as an edit, and only records with new ids are added. Pub 78's events used to
 * have position-based ids ("pub78-event-12"); those are dropped there, since the same
 * events now come back under their stable ids.
 */
const SEEDED = ["bars", "events", "specials", "menuItems", "hoursOverrides"] as const;
// Re-hashed (with a new salt) every time the seed is built, so never a real change.
const IGNORED = new Set(["adminPasswordHash"]);
const LEGACY_EVENT_ID = /^pub78-event-\d+$/;

type Row = { id: string } & Record<string, unknown>;

export function withoutVolatile(seed: Database): Database {
  return { ...seed, bars: seed.bars.map(({ adminPasswordHash: _hash, ...bar }) => bar as Database["bars"][number]) };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function syncSeed(saved: Database, seed: Database, previous: Database | null): Database {
  const base = withoutVolatile(previous ?? seed);
  const db = { ...saved };
  for (const name of SEEDED) {
    const next = new Map((seed[name] as unknown as Row[]).map((r) => [r.id, r]));
    const before = new Map((base[name] as unknown as Row[]).map((r) => [r.id, r]));
    const rows: Row[] = [];
    for (const row of (saved[name] ?? []) as unknown as Row[]) {
      if (!previous && name === "events" && LEGACY_EVENT_ID.test(row.id)) continue;
      const old = before.get(row.id);
      const fresh = next.get(row.id);
      if (!old) {
        rows.push(row);
        continue;
      }
      const keys = Object.keys({ ...old, ...(fresh ?? {}) }).filter((k) => !IGNORED.has(k));
      const edited = keys.some((k) => !same(row[k], old[k]));
      if (!fresh) {
        if (edited) rows.push(row);
        continue;
      }
      const merged: Row = { ...row };
      for (const k of keys) if (same(row[k], old[k])) merged[k] = fresh[k];
      rows.push(merged);
    }
    const savedIds = new Set(((saved[name] ?? []) as unknown as Row[]).map((r) => r.id));
    for (const [id, fresh] of next) {
      if (!savedIds.has(id) && (!previous || !before.has(id))) rows.push(fresh);
    }
    (db as unknown as Record<string, Row[]>)[name] = rows;
  }
  // The seed may be cached and reused, so don't hand out its objects for editing.
  return structuredClone(db);
}
