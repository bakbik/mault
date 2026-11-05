import {
  cardSortDirectionForField,
  DEFAULT_CARD_SORT,
  nextCardSortKeyForField,
  SET_NUMBER_SORT_FIELD,
  SORTABLE_FIELD_TYPES,
  type CardFilters,
  type FieldMeta,
} from "@magic-vault/shared";
import type { TFunction } from "i18next";
import type { CardSortOption } from "@/lib/interfaces/collections";

export function countActiveCardFilters(filters: CardFilters): number {
  return (
    filters.colors.length +
    filters.rarities.length +
    filters.foilTypes.length +
    filters.bins.length +
    filters.sets.length +
    (filters.hideDownloaded ? 1 : 0)
  );
}

export function cardSortOptions(
  fieldDefinitions: FieldMeta[],
  defaultSortLabel: string,
  selectedSort: string | null,
  t: TFunction,
): CardSortOption[] {
  // Set number works for every game, so it leads the game's own sortable fields.
  const sortable = [
    { field: SET_NUMBER_SORT_FIELD, label: t("collection.sort.setNumber") },
    ...fieldDefinitions.filter((field) => SORTABLE_FIELD_TYPES.includes(field.type)),
  ];
  return [
    {
      key: DEFAULT_CARD_SORT,
      label: defaultSortLabel,
      selected: !selectedSort || selectedSort === DEFAULT_CARD_SORT,
      sortKeyOnPress: DEFAULT_CARD_SORT,
    },
    ...sortable
      .map((field) => {
        const direction = cardSortDirectionForField(selectedSort, field.field);
        return {
          key: field.field,
          label:
            direction === "asc"
              ? t("collection.sort.ascending", { field: field.label })
              : direction === "desc"
                ? t("collection.sort.descending", { field: field.label })
                : field.label,
          selected: direction !== null,
          sortKeyOnPress: nextCardSortKeyForField(selectedSort, field.field),
        };
      }),
  ];
}
