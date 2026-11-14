import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { NumberInput } from "@/features/business/components/number-input";
import {
  fetchOwnPrice,
  saveOwnPrice,
  type OwnPrice,
} from "@/features/scanner/lib/external-identifier";
import { IconExternalLink } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The owner's own price of a scanned copy (USD), kept by the external service (see
 * fetchOwnPrice), with the service's links to look a price up. Nothing shows when no service is
 * set up or it never read this scan.
 */
export function CardOwnPrice({ scanId }: { scanId: string }) {
  const { t } = useTranslation("cards");
  const queryClient = useQueryClient();
  const queryKey = ["external-own-price", scanId];
  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchOwnPrice(scanId),
    retry: false,
    staleTime: 30_000,
  });
  const [draft, setDraft] = useState<number | null>(null);
  useEffect(() => setDraft(data?.priceUsd ?? null), [data?.priceUsd]);
  const save = useMutation({
    mutationFn: (price: number | null) => saveOwnPrice(scanId, price),
    onSuccess: (_store, price) =>
      queryClient.setQueryData<OwnPrice | null>(queryKey, (old) =>
        old ? { ...old, priceUsd: price } : old,
      ),
  });
  if (!data) return null;

  const value = draft == null || Number.isNaN(draft) ? null : draft;
  const invalid = value != null && value < 0;
  const changed = value !== data.priceUsd;
  return (
    <div className="flex flex-col gap-2">
      {data.links.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {data.links.map((link) => (
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
          <p className="text-xs text-muted-foreground">
            {t("cardDetailPanel.ownPriceSaved", { store: save.data })}
          </p>
        ) : null}
      </Field>
    </div>
  );
}
