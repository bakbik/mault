import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { cardImageForFoilType, type PlayingCard } from "@magic-vault/shared";
import { pokemonAdapter } from "../src/lib/adapters/pokemon/search";
import { withFoilTypeImage } from "../src/lib/saved-cards";

const POKE_BALL = "Reverse Holo (Poké Ball)";
const MAIN = {
  small: "/card-images/zh-cn/151C/068/low.webp",
  normal: "/card-images/zh-cn/151C/068/high.webp",
};
const BALL = {
  small: "/card-images/zh-cn/151C/068/reverse-holo-poke-ball/low.webp",
  normal: "/card-images/zh-cn/151C/068/reverse-holo-poke-ball/high.webp",
};

function stored(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "151C-068",
    localId: "068",
    name: "怪力",
    set: { id: "151C", name: "151" },
    versionPictures: { [POKE_BALL]: "reverse-holo-poke-ball" },
    ...fields,
  };
}

afterEach(() => {
  delete process.env.LOCAL_CARD_PICTURE_SETS;
});

test("a listed set's card has a picture for each version it was given, and its main one", () => {
  process.env.LOCAL_CARD_PICTURE_SETS = "zh-cn/151C";

  const card = pokemonAdapter.normalizeStored(stored(), "151C-068", "zh-cn");

  assert.deepEqual(card?.image, MAIN);
  assert.deepEqual(card?.foilTypeImages, { "": MAIN, [POKE_BALL]: BALL });
});

test("a card without version pictures has none", () => {
  process.env.LOCAL_CARD_PICTURE_SETS = "zh-cn/151C";

  const card = pokemonAdapter.normalizeStored(
    stored({ versionPictures: undefined }),
    "151C-068",
    "zh-cn",
  );

  assert.equal(card?.foilTypeImages, undefined);
});

test("version pictures of a set this install does not serve are not shown", () => {
  process.env.LOCAL_CARD_PICTURE_SETS = "zh-cn/CSV8C";

  assert.equal(
    pokemonAdapter.normalizeStored(stored(), "151C-068", "zh-cn")?.foilTypeImages,
    undefined,
  );
});

test("a version folder that is not a plain name is ignored", () => {
  process.env.LOCAL_CARD_PICTURE_SETS = "zh-cn/151C";

  const card = pokemonAdapter.normalizeStored(
    stored({ versionPictures: { [POKE_BALL]: "../../etc" } }),
    "151C-068",
    "zh-cn",
  );

  assert.equal(card?.foilTypeImages, undefined);
});

const card = {
  id: "151C-068",
  name: "怪力",
  image: MAIN,
  foilTypeImages: { "": MAIN, [POKE_BALL]: BALL },
} as PlayingCard;

test("a copy shows the picture of its version", () => {
  assert.deepEqual(cardImageForFoilType(card, POKE_BALL), BALL);
  assert.deepEqual(withFoilTypeImage(card, POKE_BALL).image, BALL);
});

test("a regular copy shows the main picture, even once shown as another version", () => {
  assert.deepEqual(cardImageForFoilType(card, null), MAIN);
  assert.deepEqual(cardImageForFoilType({ ...card, image: BALL }, undefined), MAIN);
});

test("a copy of a version without its own picture shows the main picture", () => {
  assert.deepEqual(cardImageForFoilType(card, "Reverse Holo (Master Ball)"), MAIN);
  assert.deepEqual(withFoilTypeImage(card, "Holo").image, MAIN);
});

test("a card with no version pictures keeps its picture", () => {
  const plain = { ...card, foilTypeImages: undefined };
  assert.equal(withFoilTypeImage(plain, POKE_BALL), plain);
});
