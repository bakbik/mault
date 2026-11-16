import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { NumberInput } from "@/features/business/components/number-input";
import { setCollectionCardOwnerPrice } from "@/features/collections/api/collections";
import {
  invalidateCollectionCards,
  updateInCardPages,
} from "@/features/collections/lib/card-page-cache";
import { fetchOwnPrice } from "@/features/scanner/lib/external-identifier";
import type { PlayingCard } from "@magic-vault/shared";
import { IconExternalLink } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const MAX_OWNER_PRICE = 1_000_000;

function withOwnerPrice<T extends PlayingCard>(card: T, ownerPrice: number | null): T {
  const { ownerPrice: _previous, ...rest } = card;
  return (ownerPrice == null ? rest : { ...rest, ownerPrice }) as T;
}

/**
 * The owner's own price of a copy (USD), kept on the copy: it counts as the copy's value instead
 * of any market price and is never repriced (Mault tells the external service through the
 * card.updated webhook). The external service, when set up, adds links to look a price up.
 */
export function CardOwnPrice({
  collectionGuid,
  scanId,
  ownerPrice,
}: {
  collectionGuid: string;
  scanId: string;
  ownerPrice: number | null;
}) {
  const { t } = useTranslation("cards");
  const queryClient = useQueryClient();
  const { data: lookup } = useQuery({
    queryKey: ["external-own-price", scanId],
    queryFn: () => fetchOwnPrice(scanId),
    retry: false,
    staleTime: 30_000,
  });
  const [saved, setSaved] = useState<number | null>(ownerPrice);
  const [draft, setDraft] = useState<number | null>(ownerPrice);
  useEffect(() => {
    setSaved(ownerPrice);
    setDraft(ownerPrice);
  }, [ownerPrice]);
  const save = useMutation({
    mutationFn: async (price: number | null) => {
      const result = await setCollectionCardOwnerPrice(collectionGuid, scanId, price);
      if (!result.success) throw new Error(result.message || "not saved");
      return price;
    },
    onSuccess: (price) => {
      setSaved(price);
      updateInCardPages(queryClient, collectionGuid, new Set([scanId]), (item) => ({
        ...item,
        card: withOwnerPrice(item.card, price),
      }));
      invalidateCollectionCards(queryClient, collectionGuid);
    },
  });

  const value = draft == null || Number.isNaN(draft) ? null : draft;
  const invalid = value != null && (value < 0 || value > MAX_OWNER_PRICE);
  const changed = value !== saved;
  const links = lookup?.links ?? [];
  return (
    <div className="flex flex-col gap-2">
      {links.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline w-fit"
            >
              {link.label}
              <IconExternalLink className="size-3.5" />
            </a>
          ))}
        </div>
      )}
      <Field className="w-60" data-invalid={invalid || !!save.error || undefined}>
        <FieldLabel htmlFor="card-own-price">{t("cardDetailPanel.ownPrice")}</FieldLabel>
        <div className="flex gap-2">
          <NumberInput
            id="card-own-price"
            min={0}
            step={0.01}
            placeholder={t("cardDetailPanel.ownPriceEmpty")}
            value={draft}
            onChange={setDraft}
            aria-invalid={invalid}
          />
          <Button
            variant="outline"
            disabled={!changed || invalid || save.isPending}
            onClick={() => save.mutate(value)}
          >
            {t("cardDetailPanel.ownPriceSave")}
          </Button>
        </div>
        {save.error ? (
          <FieldError
            errors={[
              { message: t("cardDetailPanel.ownPriceSaveFailed", { message: save.error.message }) },
            ]}
          />
        ) : save.isSuccess && !changed ? (
          <p className="text-xs text-muted-foreground">{t("cardDetailPanel.ownPriceSaved")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("cardDetailPanel.ownPriceHint")}</p>
        )}
      </Field>
    </div>
  );
}
