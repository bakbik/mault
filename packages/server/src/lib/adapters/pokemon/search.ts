import { pokemonStampProducts, pokemonStamps } from "./stamps";
import { pokemonPrintingMarkGroups } from "../../printing-marks/groups";
import {
  type PlayingCard,
  type PlayingCardImage,
  proxiedImageUrl,
} from "@magic-vault/shared";
import { sql } from "drizzle-orm";
import { fetchCardApi } from "../../card-search/fetch";
import type { CardSearchAdapter } from "../../interfaces/card-search";
import {
  japaneseProductMatch,
  mainProductId,
  pokemonFinishes,
  pokemonFinishProducts,
  pokemonFoilOnlyFoilType,
  pokemonTcgplayerProductId,
  pokemonListsNonFoilPrinting,
  separatesPatterns,
} from "./finishes";
import {
  CARD_API_HEADERS,
  POKEMON_JAPAN_TCGPLAYER_CATEGORY_ID,
} from "../../constants/card-search";
import { POKEMON_FOIL_TYPES_BY_TCGPLAYER_VARIANT } from "../../constants/pokemon";
import { POKEMON_DEFAULT_URL } from "../../constants/urls";
import type {
  PokemonCardDetail,
  PokemonPricing,
} from "../../interfaces/pokemon";

function assetUrl(image: string, quality: "low" | "high"): string {
  return proxiedImageUrl(`${image}/${quality}.webp`);
}

/**
 * The source's picture, or this install's own for a set the source lists without any: such a set
 * goes in LOCAL_CARD_PICTURE_SETS ("ja/M6a,ja/M5") with its files served at
 * /card-images/<lang>/<set>/<number>/{low,high}.webp.
 */
function pictureUrl(
  raw: PokemonCardDetail,
  lang: string | undefined,
  quality: "low" | "high",
): string {
  if (raw.image) return assetUrl(raw.image, quality);
  const set = raw.set?.id;
  const listed = (process.env.LOCAL_CARD_PICTURE_SETS ?? "").split(",");
  return set && raw.localId && listed.includes(`${lang}/${set}`)
    ? `/card-images/${lang}/${set}/${raw.localId}/${quality}.webp`
    : "";
}

const VERSION_FOLDER = /^[a-z0-9-]{1,60}$/;

/**
 * Pictures of the card's own versions, for a card of a set this install serves pictures for
 * whose versions look different (a Chinese card's Poké Ball reverse holo): the record's
 * versionPictures ({foil type: folder}) are served at
 * /card-images/<lang>/<set>/<number>/<folder>/{low,high}.webp, "" being the main picture.
 */
function versionPictures(
  raw: PokemonCardDetail,
  lang: string | undefined,
  main: PlayingCardImage | null,
): Record<string, PlayingCardImage> | undefined {
  const set = raw.set?.id;
  const listed = (process.env.LOCAL_CARD_PICTURE_SETS ?? "").split(",");
  if (!main || raw.image || !set || !raw.localId || !listed.includes(`${lang}/${set}`)) return undefined;
  const versions = Object.entries(raw.versionPictures ?? {}).filter(
    ([foilType, folder]) => foilType && typeof folder === "string" && VERSION_FOLDER.test(folder),
  );
  if (versions.length === 0) return undefined;
  const base = `/card-images/${lang}/${set}/${raw.localId}`;
  return Object.fromEntries([
    ["", main],
    ...versions.map(([foilType, folder]) => [
      foilType,
      { small: `${base}/${folder}/low.webp`, normal: `${base}/${folder}/high.webp` },
    ]),
  ]);
}

const JAPANESE = "ja";

function urlForLang(lang: string): string {
  return POKEMON_DEFAULT_URL.replace(/\/v2\/[^/]+\//, `/v2/${lang}/`);
}

function resolvePrice(pricing: PokemonPricing | undefined): number | null {
  return pricing?.tcgplayer?.normal?.marketPrice ?? null;
}

function resolveFoilPrice(pricing: PokemonPricing | undefined): number | null {
  return (
    pricing?.tcgplayer?.holofoil?.marketPrice ??
    pricing?.tcgplayer?.["reverse-holofoil"]?.marketPrice ??
    null
  );
}

function resolveTcgplayerId(
  pricing: PokemonPricing | undefined,
): string | undefined {
  const productId = pokemonTcgplayerProductId(pricing);
  return productId != null ? String(productId) : undefined;
}

function normalizePokemonCard(raw: PokemonCardDetail, lang?: string): PlayingCard {
  const small = pictureUrl(raw, lang, "low");
  const large = pictureUrl(raw, lang, "high");
  const attackText = (raw.attacks ?? [])
    .map((a) =>
      [a.name, a.damage != null ? `(${a.damage})` : "", a.effect]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
  const abilityText = (raw.abilities ?? [])
    .map((a) => [a.name, a.effect].filter(Boolean).join(": "))
    .join("\n");
  const text =
    [raw.effect, raw.description, abilityText, attackText]
      .filter(Boolean)
      .join("\n\n") || undefined;
  const japanese = lang === JAPANESE;
  const foilTypes = pokemonFinishes(raw, separatesPatterns(lang)).map((finish) => finish.foilType);
  const stamps = pokemonStamps(raw);
  const japaneseProduct = japanese ? mainProductId(raw) : null;
  const typeLine =
    [raw.category, raw.stage ?? raw.trainerType ?? raw.energyType]
      .filter(Boolean)
      .join(" - ") ||
    (raw.category ?? "");

  const image = large ? { small: small || large, normal: large } : null;
  const foilTypeImages = versionPictures(raw, lang, image);
  return {
    id: raw.id,
    name: raw.name ?? "",
    image,
    ...(foilTypeImages ? { foilTypeImages } : {}),
    set: raw.set?.id ?? "",
    setName: raw.set?.name || (raw.set?.id ?? ""),
    collectorNumber: raw.localId ?? "",
    rarity: (raw.rarity ?? "").toLowerCase(),
    typeLine,
    text,
    power: undefined,
    toughness: raw.hp != null ? String(raw.hp) : undefined,
    colorIdentity: raw.types ?? [],
    artist: raw.illustrator ?? undefined,
    price: resolvePrice(raw.pricing),
    priceFoil: resolveFoilPrice(raw.pricing),
    sourceUrl: `https://tcgdex.dev/cards/${raw.id}`,
    tcgplayerId:
      resolveTcgplayerId(raw.pricing) ??
      (japaneseProduct != null ? String(japaneseProduct) : undefined),
    foilTypes: foilTypes.length > 0 ? foilTypes : undefined,
    foilOnlyFoilType: pokemonFoilOnlyFoilType(raw, foilTypes),
    stamps: stamps.length > 0 ? stamps : undefined,
    cmc: raw.retreat,
    ...(lang ? { lang } : {}),
    raw,
  };
}

export async function fetchDetail(
  id: string,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<PokemonCardDetail | null> {
  const response = await fetchCardApi(`${baseUrl}/${id}`, {
    headers: CARD_API_HEADERS,
    signal,
  });
  if (!response.ok) return null;
  return (await response.json()) as PokemonCardDetail;
}

export const pokemonAdapter: CardSearchAdapter = {
  defaultUrl: POKEMON_DEFAULT_URL,
  urlForLang,
  normalizeStored: (raw, _id, lang) =>
    normalizePokemonCard(raw as PokemonCardDetail, lang),
  excludedFromMatchingSql: sql`(data->>'image') LIKE '%/tcgp/%'`,
  printedSetTotalSql: sql`CASE WHEN data->'set'->'cardCount'->>'official' ~ '^[0-9]+$' THEN (data->'set'->'cardCount'->>'official')::int END`,
  printingMarkGroups: pokemonPrintingMarkGroups,
  sourceListsNonFoilPrinting: (card) =>
    pokemonListsNonFoilPrinting(card.raw as PokemonCardDetail),
  tcgplayer: {
    categoryId: 3,
    // Japanese cards are TCGplayer's "Pokemon Japan" category, matched by set code and number
    // when the source names no product (most Mega-era sets, Pokemon Card 151).
    categoryIdOf: (card) =>
      card.lang === JAPANESE ? POKEMON_JAPAN_TCGPLAYER_CATEGORY_ID : 3,
    productMatch: (card) =>
      card.lang === JAPANESE
        ? japaneseProductMatch(card.raw as PokemonCardDetail)
        : null,
    foilTypeOfVariant: (variant) =>
      POKEMON_FOIL_TYPES_BY_TCGPLAYER_VARIANT[variant] ?? variant,
    productIdFromRaw: (card) =>
      resolveTcgplayerId((card.raw as PokemonCardDetail).pricing),
    finishProducts: pokemonFinishProducts,
    stampProducts: (card) => pokemonStampProducts(card.raw as PokemonCardDetail),
    subTypes: () => ({
      price: [
        "Normal",
        "Unlimited",
        "Holofoil",
        "Unlimited Holofoil",
        "1st Edition",
        "1st Edition Holofoil",
      ],
      priceFoil: [
        "Holofoil",
        "Reverse Holofoil",
        "Unlimited Holofoil",
        "1st Edition Holofoil",
      ],
    }),
  },
  cardmarket: {
    gameId: 6,
    siteGamePath: "Pokemon",
    productIdFromRaw: (card) =>
      (card.raw as PokemonCardDetail).pricing?.cardmarket?.idProduct,
  },
};
