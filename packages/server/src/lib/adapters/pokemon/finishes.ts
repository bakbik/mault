import { finishFamily, type PlayingCard } from "@magic-vault/shared";
import {
  POKEMON_FINISH_BASE_LABELS,
  POKEMON_FINISH_PATTERN_LABELS,
  POKEMON_FINISH_SUBTYPES,
  POKEMON_SEPARATE_FINISH_PRODUCT_SUBTYPES,
  POKEMON_STANDARD_VARIANT_SIZE,
} from "../../constants/pokemon";
import type {
  TcgplayerFinishProduct,
  TcgplayerProductCandidate,
  TcgplayerProductMatch,
} from "../../interfaces/card-search";
import type {
  PokemonCardDetail,
  PokemonFinish,
  PokemonPricing,
} from "../../interfaces/pokemon";

function patternLabel(pattern: string): string {
  return (
    POKEMON_FINISH_PATTERN_LABELS[pattern] ??
    pattern
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

export function pokemonTcgplayerProductId(
  pricing: PokemonPricing | undefined,
): number | null {
  const tcgplayer = pricing?.tcgplayer;
  if (!tcgplayer) return null;
  const preferred =
    tcgplayer.normal?.productId ??
    tcgplayer.holofoil?.productId ??
    tcgplayer["reverse-holofoil"]?.productId;
  if (preferred != null) return preferred;
  for (const value of Object.values(tcgplayer)) {
    if (typeof value === "object" && value?.productId != null) return value.productId;
  }
  return null;
}

export function mainProductId(raw: PokemonCardDetail): number | null {
  return (
    raw.variants_detailed?.find((variant) => variant.type === "normal")?.thirdParty
      ?.tcgplayer ??
    pokemonTcgplayerProductId(raw.pricing)
  );
}

/**
 * A Japanese card's TCGplayer product, found by the printed number ("037/165") in the set whose
 * TCGplayer group starts with the set's code ("SV2a: Pokemon Card 151"), for cards the source
 * names no product for. A pattern ("masterball") finds the "(Master Ball Pattern)" product, a
 * plain reverse holo the "(Mirror Foil)" one, anything else the card's own product.
 */
export function japaneseProductMatch(
  raw: PokemonCardDetail,
  finish?: { variantType: string; pattern?: string },
): TcgplayerProductMatch | null {
  const setId = raw.set?.id;
  const official = raw.set?.cardCount?.official;
  if (!setId || !official || !raw.localId || !/^\d+$/.test(raw.localId)) return null;
  const pad = (value: string | number) => String(value).padStart(3, "0");
  const group = `${setId.toLowerCase()}:`;
  const suffix = finish?.pattern
    ? `(${plainLetters(patternLabel(finish.pattern)).toLowerCase()} pattern)`
    : finish?.variantType === "reverse"
      ? "(mirror foil)"
      : null;
  return {
    numbers: [`${pad(raw.localId)}/${pad(official)}`],
    accepts: (product: TcgplayerProductCandidate) => {
      if (!(product.groupName ?? "").toLowerCase().startsWith(group)) return false;
      const name = plainLetters(product.name).toLowerCase().trim();
      return suffix
        ? name.endsWith(suffix)
        : !/\((?:[^()]* pattern|mirror foil)\)$/.test(name);
    },
  };
}

function plainLetters(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * `separatePatterns`: a patterned variant the source names no product for is still its own
 * printing (Japanese Poké Ball and Master Ball mirrors), rather than folding into the plain one.
 */
export function pokemonFinishes(
  raw: PokemonCardDetail,
  separatePatterns = false,
): PokemonFinish[] {
  const finishes = new Map<string, PokemonFinish>();
  const mainProduct = mainProductId(raw);
  for (const variant of raw.variants_detailed ?? []) {
    const base = variant.type ? POKEMON_FINISH_BASE_LABELS[variant.type] : undefined;
    if (
      !base ||
      variant.stamp?.length ||
      (variant.size ?? POKEMON_STANDARD_VARIANT_SIZE) !== POKEMON_STANDARD_VARIANT_SIZE
    ) {
      continue;
    }
    const productId = variant.thirdParty?.tcgplayer ?? null;
    const isOwnProduct =
      productId != null ? productId !== mainProduct : separatePatterns && !!variant.foil;
    const foilType =
      variant.foil && isOwnProduct ? `${base} (${patternLabel(variant.foil)})` : base;
    if (finishes.has(foilType)) continue;
    finishes.set(foilType, {
      foilType,
      variantType: variant.type!,
      tcgplayerProductId: productId,
      ...(variant.foil && isOwnProduct ? { pattern: variant.foil } : {}),
    });
  }
  return [...finishes.values()];
}

/**
 * Languages whose patterned mirrors (Poké Ball, Master Ball) are printings of their own even when
 * the source names no product for them: Japanese, and Simplified Chinese, whose cards no price
 * source lists at all.
 */
const SEPARATE_PATTERN_LANGS = new Set(["ja", "zh-cn"]);

export function separatesPatterns(lang: string | undefined): boolean {
  return !!lang && SEPARATE_PATTERN_LANGS.has(lang);
}

export function pokemonFinishProducts(card: PlayingCard): TcgplayerFinishProduct[] {
  const mainProductId = Number(card.tcgplayerId);
  const raw = card.raw as PokemonCardDetail;
  return pokemonFinishes(raw, separatesPatterns(card.lang)).flatMap((finish): TcgplayerFinishProduct[] => {
    const subTypes = POKEMON_FINISH_SUBTYPES[finish.variantType] ?? [];
    if (finish.tcgplayerProductId) {
      return [
        {
          foilType: finish.foilType,
          productId: finish.tcgplayerProductId,
          subTypes: [
            ...subTypes,
            ...(finish.tcgplayerProductId !== mainProductId
              ? POKEMON_SEPARATE_FINISH_PRODUCT_SUBTYPES
              : []),
          ],
        },
      ];
    }
    const match = japanese ? japaneseProductMatch(raw, finish) : null;
    if (!match) return [];
    const ownProduct = !!finish.pattern || finish.variantType === "reverse";
    return [
      {
        foilType: finish.foilType,
        productId: null,
        match,
        subTypes: [...subTypes, ...(ownProduct ? POKEMON_SEPARATE_FINISH_PRODUCT_SUBTYPES : [])],
      },
    ];
  });
}

export function pokemonListsNonFoilPrinting(raw: PokemonCardDetail): boolean {
  return (raw.variants_detailed ?? []).some((variant) => variant.type === "normal");
}

export function pokemonFoilOnlyFoilType(
  raw: PokemonCardDetail,
  foilTypes: string[],
): string | undefined {
  const variants = raw.variants_detailed ?? [];
  if (variants.length === 0 || pokemonListsNonFoilPrinting(raw)) return undefined;
  const holoLabel = POKEMON_FINISH_BASE_LABELS.holo;
  const listedFoilType =
    foilTypes.find((foilType) => finishFamily(foilType) === holoLabel) ?? foilTypes[0];
  if (listedFoilType) return listedFoilType;
  return variants.every((variant) => variant.type === "reverse")
    ? POKEMON_FINISH_BASE_LABELS.reverse
    : holoLabel;
}
