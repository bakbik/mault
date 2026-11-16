import { FINISH_PATTERN_SUFFIX_PATTERN } from "./constants/card-finish.constant";
import type { PlayingCard, PlayingCardImage } from "./interfaces/card.interface";

/**
 * The picture of a copy of the card: the picture of its version (foil type) when the card has
 * one of its own, else the card's main picture.
 */
export function cardImageForFoilType(
  card: Pick<PlayingCard, "image" | "foilTypeImages">,
  foilType: string | null | undefined,
): PlayingCardImage | null {
  const versions = card.foilTypeImages;
  return versions?.[foilType ?? ""] ?? versions?.[""] ?? card.image;
}

export function cardFoilTypeOptions(
  gameFoilTypes: string[],
  card: PlayingCard | null | undefined,
  currentFoilType?: string | null,
): string[] {
  const options = card?.foilTypes?.length ? card.foilTypes : gameFoilTypes;
  return currentFoilType && !options.includes(currentFoilType)
    ? [...options, currentFoilType]
    : options;
}

export function finishFamily(foilType: string): string {
  return foilType.replace(FINISH_PATTERN_SUFFIX_PATTERN, "");
}

export function scanFoilType(
  card: PlayingCard,
  sessionFoilType: string | null,
): string | null {
  if (!sessionFoilType) return card.foilOnlyFoilType ?? null;
  const family = finishFamily(sessionFoilType);
  if (sessionFoilType !== family) return sessionFoilType;
  const options = (card.foilTypes ?? []).filter(
    (foilType) => finishFamily(foilType) === family,
  );
  return options.length === 1 ? options[0] : sessionFoilType;
}
