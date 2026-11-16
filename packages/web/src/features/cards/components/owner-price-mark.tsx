import type { PlayingCard } from "@magic-vault/shared";
import { IconPencil } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

/**
 * A small pencil beside a copy's price when the price is the owner's own (typed in the card
 * panel), not a market price.
 */
export function OwnerPriceMark({ card }: { card: Pick<PlayingCard, "ownerPrice"> }) {
  const { t } = useTranslation("cards");
  if (card.ownerPrice == null) return null;
  const label = t("cardDetailPanel.ownerPriceMark");
  return (
    <span title={label} className="inline-flex shrink-0 align-middle">
      <IconPencil aria-label={label} role="img" className="size-3 opacity-70" />
    </span>
  );
}
