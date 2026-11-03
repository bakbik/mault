import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchDetails } from "../src/lib/adapters/pokemon/sync";

const realFetch = globalThis.fetch;
const base = "https://api.tcgdex.net/v2/en/cards";
const briefs = ["swsh5-28", "swsh5-29", "swsh5-30"].map((id) => ({
  id,
  localId: id.split("-")[1],
  name: id,
  image: `https://assets.tcgdex.net/en/swsh/swsh5/${id.split("-")[1]}`,
}));

/** The source fails every detail request until `outage` of them have failed (a stretch of errors). */
function sourceDownFor(outage: number): string[] {
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const id = String(url).split("/").pop()!;
    asked.push(id);
    if (asked.length <= outage) return new Response("busy", { status: 503 });
    return Response.json({ id, localId: id.split("-")[1], name: id, set: { id: "swsh5", name: "Battle Styles" } });
  }) as typeof fetch;
  return asked;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("cards whose details failed during a stretch of errors are fetched again later", async () => {
  sourceDownFor(6); // both immediate tries of all three cards

  const cards = await fetchDetails(briefs, base, () => {}, undefined, [0]);

  for (const card of cards) assert.equal(JSON.parse(card.data).set?.name, "Battle Styles", card.id);
});

test("a card that never answers keeps its listing, and the log names it", async () => {
  sourceDownFor(1_000);
  const log: string[] = [];

  const cards = await fetchDetails(briefs.slice(0, 1), base, (line) => log.push(line), undefined, [0, 0]);

  assert.equal(JSON.parse(cards[0].data).set, undefined);
  assert.ok(log.some((line) => line.includes("swsh5-28")), log.join("\n"));
});
