import type { CardFilters } from "../interfaces/collection-cards.interface";

export const COLLECTION_CARDS_PAGE_SIZE = 50;

export const PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 75, 100];

export const DEFAULT_CARD_SORT = "scan-desc";

/** Built-in sort for every game: set code, then collector number, both in natural order. */
export const SET_NUMBER_SORT_FIELD = "set-number";
export const SET_NUMBER_SORT_ASC = `${SET_NUMBER_SORT_FIELD}-asc`;
export const SET_NUMBER_SORT_DESC = `${SET_NUMBER_SORT_FIELD}-desc`;

export const EMPTY_CARD_FILTERS: CardFilters = {
  colors: [],
  rarities: [],
  bins: [],
  needsAttention: false,
  hideDownloaded: false,
  sets: [],
  minMatchPercent: 0,
  foilTypes: [],
};
export const RECENT_SCANNED_CARDS_COUNT = 5;

export const UNMATCHED_PREVIEW_COUNT = 5;

export const UNMATCHED_PAGE_SIZE = 24;

export const UNMATCHED_PAGE_MAX = 100;

export const COLLECTION_PREVIEW_IMAGE_COUNT = 3;
export const BULK_SCAN_IDS_MAX = 50_000;
