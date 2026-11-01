import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { pokemonAdapter } from "../src/lib/adapters/pokemon/search";

function stored(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "M6a-137",
    localId: "137",
    name: "リザードン",
    set: { id: "M6a", name: "30th CELEBRATION" },
    ...fields,
  };
}

afterEach(() => {
  delete process.env.LOCAL_CARD_PICTURE_SETS;
});

test("a listed set's card the source has no picture for uses this install's picture", () => {
  process.env.LOCAL_CARD_PICTURE_SETS = "ja/M5,ja/M6a";

  const card = pokemonAdapter.normalizeStored(stored(), "M6a-137", "ja");

  assert.deepEqual(card?.image, {
    small: "/card-images/ja/M6a/137/low.webp",
    normal: "/card-images/ja/M6a/137/high.webp",
  });
});

test("the source's own picture wins over this install's", () => {
  process.env.LOCAL_CARD_PICTURE_SETS = "ja/M6a";

  const card = pokemonAdapter.normalizeStored(
    stored({ image: "https://assets.tcgdex.net/ja/M/M6a/137" }),
    "M6a-137",
    "ja",
  );

  assert.match(card?.image?.normal ?? "", /^\/api\/cards\/image-proxy\?url=/);
});

test("a set that is not listed stays without a picture", () => {
  process.env.LOCAL_CARD_PICTURE_SETS = "ja/M5";

  assert.equal(pokemonAdapter.normalizeStored(stored(), "M6a-137", "ja")?.image, null);
});

test("a listed set in another language stays without a picture", () => {
  process.env.LOCAL_CARD_PICTURE_SETS = "ja/M6a";

  assert.equal(pokemonAdapter.normalizeStored(stored(), "M6a-137", "en")?.image, null);
});

test("nothing is listed by default", () => {
  assert.equal(pokemonAdapter.normalizeStored(stored(), "M6a-137", "ja")?.image, null);
});
