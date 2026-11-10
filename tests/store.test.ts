import { afterEach, describe, expect, it, vi } from "vitest";
import { getStore } from "../src/lib/store";

describe("Redis demo store", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps admin edits across requests", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://redis.example/");
    vi.stubEnv("KV_REST_API_TOKEN", "token");
    const kv = new Map<string, string>();
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const [cmd, ...args] = JSON.parse(String(init.body)) as string[];
      if (cmd === "SET") kv.set(args[0], args[1]);
      if (cmd === "MGET") return Response.json({ result: args.map((k) => kv.get(k) ?? null) });
      return Response.json({ result: cmd === "GET" ? kv.get(args[0]) ?? null : "OK" });
    });

    const first = await getStore();
    const bar = (await first.findBar({ slug: "pub-78" }))!;
    const before = (await first.list("specials", bar.id)).length;
    await first.create("specials", {
      barId: bar.id, title: "Taco Tuesday", description: "", price: "$2 tacos",
      days: [2], date: null, startTime: null, endTime: null, active: true, googlePostName: null,
    });

    // A later request (possibly on another server instance) reads it back.
    const second = await getStore();
    const specials = await second.list("specials", bar.id);
    expect(specials).toHaveLength(before + 1);
    expect(specials.some((s) => s.title === "Taco Tuesday")).toBe(true);
  });
});
