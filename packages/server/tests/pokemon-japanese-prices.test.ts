import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlayingCard } from "@magic-vault/shared";
import {
  japaneseProductMatch,
  pokemonFinishes,
  pokemonFinishProducts,
} from "../src/lib/adapters/pokemon/finishes";
import { pokemonAdapter } from "../src/lib/adapters/pokemon/search";
import type { PokemonCardDetail } from "../src/lib/interfaces/pokemon";

// Pokemon Card 151 as TCGdex lists it in Japanese: no TCGplayer ids, two patterned mirrors.
const vulpix: PokemonCardDetail = {
  id: "SV2a-037",
  localId: "037",
  name: "ロコン",
  set: { id: "SV2a", name: "ポケモンカード151", cardCount: { official: 165, total: 210 } },
  variants_detailed: [
    { type: "normal", size: "standard" },
    { type: "reverse", size: "standard", foil: "pokeball" },
    { type: "reverse", size: "standard", foil: "masterball" },
  ],
};

// Terastal Fest ex: TCGdex names the TCGplayer products.
const ironMoth: PokemonCardDetail = {
  id: "SV8a-024",
  localId: "024",
  name: "テツノドクガ",
  set: { id: "SV8a", name: "テラスタルフェスex", cardCount: { official: 187, total: 237 } },
  variants_detailed: [
    { type: "normal", size: "standard", thirdParty: { tcgplayer: 602359 } },
    { type: "reverse", size: "standard", foil: "masterball", thirdParty: { tcgplayer: 604519 } },
    { type: "reverse", size: "standard", thirdParty: { tcgplayer: 602360 } },
  ],
};

const product = (name: string, groupName = "SV2a: Pokemon Card 151") => ({
  name,
  rarity: "Common",
  groupName,
});

test("a Japanese card's patterned mirrors are separate finishes, an English card's fold", () => {
  assert.deepEqual(
    pokemonFinishes(vulpix, true).map((finish) => finish.foilType),
    ["Reverse Holo (Poké Ball)", "Reverse Holo (Master Ball)"],
  );
  assert.deepEqual(pokemonFinishes(vulpix).map((finish) => finish.foilType), ["Reverse Holo"]);
});

test("the plain product is found by set code and printed number", () => {
  const match = japaneseProductMatch(vulpix)!;
  assert.deepEqual(match.numbers, ["037/165"]);
  assert.equal(match.accepts(product("Vulpix")), true);
  assert.equal(match.accepts(product("Iono's Bellibolt ex - 057/193")), true);
  assert.equal(match.accepts(product("Vulpix (Master Ball Pattern)")), false);
  assert.equal(match.accepts(product("Vulpix (Mirror Foil)")), false);
  assert.equal(match.accepts(product("Vulpix", "SV2: Snow Hazard")), false);
});

test("each patterned mirror finds its own pattern's product", () => {
  const card = { id: vulpix.id, lang: "ja", raw: vulpix } as PlayingCard;
  const finishes = pokemonFinishProducts(card);
  assert.deepEqual(
    finishes.map((finish) => [finish.foilType, finish.productId, finish.subTypes.at(-1)]),
    [
      ["Reverse Holo (Poké Ball)", null, "Normal"],
      ["Reverse Holo (Master Ball)", null, "Normal"],
    ],
  );
  const [pokeBall, masterBall] = finishes.map((finish) => finish.match!);
  assert.equal(pokeBall.accepts(product("Vulpix (Poke Ball Pattern)")), true);
  assert.equal(pokeBall.accepts(product("Vulpix (Master Ball Pattern)")), false);
  assert.equal(masterBall.accepts(product("Vulpix (Master Ball Pattern)")), true);
  assert.equal(masterBall.accepts(product("Vulpix")), false);
});

test("an English card asks for no match", () => {
  const card = { id: vulpix.id, lang: "en", raw: vulpix } as PlayingCard;
  assert.deepEqual(pokemonFinishProducts(card), []);
  assert.equal(pokemonAdapter.tcgplayer!.productMatch!(card), null);
});

test("Japanese cards price from TCGplayer's Japanese category with the ids TCGdex gives", () => {
  const pricing = pokemonAdapter.tcgplayer!;
  const japanese = pokemonAdapter.normalizeStored(ironMoth, ironMoth.id, "ja")!;
  assert.equal(japanese.lang, "ja");
  assert.equal(japanese.tcgplayerId, "602359");
  assert.equal(pricing.categoryIdOf!(japanese), 85);
  assert.deepEqual(japanese.foilTypes, ["Reverse Holo (Master Ball)", "Reverse Holo"]);
  assert.deepEqual(
    pokemonFinishProducts(japanese).map((finish) => [finish.foilType, finish.productId]),
    [
      ["Reverse Holo (Master Ball)", 604519],
      ["Reverse Holo", 602360],
    ],
  );

  const english = pokemonAdapter.normalizeStored(ironMoth, ironMoth.id, "en")!;
  assert.equal(english.tcgplayerId, undefined);
  assert.equal(pricing.categoryIdOf!(english), 3);
});
