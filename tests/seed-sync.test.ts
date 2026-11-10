import { afterEach, describe, expect, it, vi } from "vitest";
import { seedData } from "../src/lib/seed";
import { syncSeed } from "../src/lib/seed-sync";
import { getStore } from "../src/lib/store";

const now = new Date("2026-11-10T18:00:00Z");

describe("syncing seed data changes into a saved database", () => {
  it("takes new seed values, keeps admin edits and deletions", () => {
    const previous = seedData(now);
    const saved = structuredClone(previous);
    const special = saved.specials.find((s) => s.id === "pub78-sp-1")!;
    special.price = "$2 drafts"; // edited in the admin
    saved.menuItems = saved.menuItems.filter((m) => m.id !== "pub78-item-1"); // deleted in the admin

    const seed = structuredClone(previous);
    seed.specials.find((s) => s.id === "pub78-sp-1")!.price = "$4 drafts";
    seed.specials.find((s) => s.id === "pub78-sp-1")!.title = "Happier Hour";
    const band = seed.events.find((e) => e.title === "Live Music: 3 Piece")!;
    band.genre = "Blues";
    seed.events.push({ ...band, id: "new-one", title: "New show" });

    const db = syncSeed(saved, seed, previous);
    const sp = db.specials.find((s) => s.id === "pub78-sp-1")!;
    expect(sp.price).toBe("$2 drafts");
    expect(sp.title).toBe("Happier Hour");
    expect(db.events.find((e) => e.id === band.id)!.genre).toBe("Blues");
    expect(db.events.some((e) => e.id === "new-one")).toBe(true);
    expect(db.menuItems.some((m) => m.id === "pub78-item-1")).toBe(false);
  });

  it("fixes a database saved before syncing, with position-based event ids", () => {
    const fresh = seedData(now);
    const saved = structuredClone(fresh);
    const pub78 = saved.events.filter((e) => e.id.startsWith("pub78-event-"));
    pub78.forEach((e, i) => {
      e.id = `pub78-event-${i + 1}`;
      e.genre = null;
    });
    saved.events = saved.events.filter((e) => !e.title.includes("Rad Canvas"));
    saved.specials.find((s) => s.id === "pub78-sp-1")!.price = "$2 drafts";

    const db = syncSeed(saved, fresh, null);
    expect(db.events.find((e) => e.title === "Live Music: Wannabe Weekenders")!.genre).toBe(
      "Jazz, Blues and Rock & Roll",
    );
    expect(db.events.filter((e) => e.title.includes("Rad Canvas"))).toHaveLength(1);
    expect(new Set(db.events.map((e) => e.id)).size).toBe(db.events.length);
    expect(db.events.length).toBe(fresh.events.length);
    expect(db.specials.find((s) => s.id === "pub78-sp-1")!.price).toBe("$2 drafts");
  });
});

describe("Redis demo store and seed changes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("shows seed changes in a database saved before they were made", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://redis.example/");
    vi.stubEnv("KV_REST_API_TOKEN", "token");
    const old = seedData();
    // As saved before PR #26: position-based ids and no genre yet.
    old.events
      .filter((e) => e.id.startsWith("pub78-event-"))
      .forEach((e, i) => {
        e.id = `pub78-event-${i + 1}`;
        if (e.title === "Live Music: Wildwood Country") e.genre = null;
      });
    const kv = new Map<string, string>([["bar-sites:db", JSON.stringify(old)]]);
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const [cmd, ...args] = JSON.parse(String(init.body)) as string[];
      if (cmd === "SET") kv.set(args[0], args[1]);
      if (cmd === "MGET") return Response.json({ result: args.map((k) => kv.get(k) ?? null) });
      return Response.json({ result: cmd === "GET" ? kv.get(args[0]) ?? null : "OK" });
    });

    const store = await getStore();
    const events = await store.list("events", "pub-78");
    expect(events.find((e) => e.title === "Live Music: Wildwood Country")!.genre).toBe("Country");
    expect(kv.has("bar-sites:seed")).toBe(true);
  });
});
