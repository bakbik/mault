import { learnCard } from "@/features/cards/api/card";
import { getCardById } from "@/features/cards/api/card-search";
import { extractCardImage } from "@/features/scanner/lib/card-detection";
import type { ScanOutcome } from "@/lib/interfaces/scanner";
import { runtimeEnv } from "@/lib/runtime-env";
import { scanLog } from "@/lib/scan-log";
import type {
  CardContour,
  UnmatchedScanDiagnostics,
} from "@magic-vault/shared";

/**
 * Optional external card identifier, off unless VITE_EXTERNAL_IDENTIFIER_URL is set in the
 * web container's environment. When it is set, every captured frame is also sent to that service, and its
 * answer decides the card: its card replaces the scanner's own match, and its "failed" (or no
 * answer within EXTERNAL_IDENTIFY_TIMEOUT_MS) becomes an unmatched scan with the reason.
 *
 * The service answers POST /identify (the full frame as JPEG; headers X-Corners with the detected
 * card corners in frame pixels, X-Mault-Card with the scanner's own answer, X-Collection-Lang with
 * the collection's language) with { card_id, lang, price_usd? } or { failed: reason }, and
 * GET /health. price_usd, when given, replaces the card's own USD price, so price rules sort by
 * the service's price.
 *
 * A card the service names that the catalog lacks (its source lists it without a picture, so no
 * sync could store it) is learned from this scan: stored with the scanned card as its picture,
 * so the next copy matches on its own. A card already in the catalog is never replaced.
 */
const SERVICE_URL = (runtimeEnv("VITE_EXTERNAL_IDENTIFIER_URL") ?? "").replace(
  /\/+$/,
  "",
);
export const EXTERNAL_IDENTIFY_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 2_000;
const JPEG_QUALITY = 0.95;

// After a timeout or a network error the service counts as down: each later card first asks
// /health briefly, so a dead service costs 2 s per card instead of 30 s.
let serviceDown = false;

export type ExternalAnswer =
  | { kind: "card"; cardId: string; lang: string; priceUsd: number | null }
  | { kind: "failed"; reason: string }
  | { kind: "unavailable"; reason: string };

export function externalIdentifierEnabled(): boolean {
  return SERVICE_URL !== "";
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function fetchWithin(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function frameAsJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("frame could not be encoded")),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}

export async function identifyExternally(
  canvas: HTMLCanvasElement,
  contour: CardContour | null,
  scannerCardId: string | null,
  collectionLang?: string,
): Promise<ExternalAnswer> {
  if (serviceDown) {
    try {
      const health = await fetchWithin(
        `${SERVICE_URL}/health`,
        {},
        HEALTH_TIMEOUT_MS,
      );
      if (!health.ok) throw new Error(`health check answered ${health.status}`);
      serviceDown = false;
    } catch (err) {
      return {
        kind: "unavailable",
        reason: `external identifier down (${describe(err)})`,
      };
    }
  }
  try {
    const headers: Record<string, string> = { "Content-Type": "image/jpeg" };
    if (contour) {
      const { topLeft, topRight, bottomRight, bottomLeft } = contour;
      headers["X-Corners"] = JSON.stringify(
        [topLeft, topRight, bottomRight, bottomLeft].map((p) => [p.x, p.y]),
      );
    }
    if (scannerCardId) headers["X-Mault-Card"] = scannerCardId;
    if (collectionLang) headers["X-Collection-Lang"] = collectionLang;
    const response = await fetchWithin(
      `${SERVICE_URL}/identify`,
      { method: "POST", body: await frameAsJpeg(canvas), headers },
      EXTERNAL_IDENTIFY_TIMEOUT_MS,
    );
    if (!response.ok) {
      return {
        kind: "failed",
        reason: `external identifier answered ${response.status}`,
      };
    }
    const answer = (await response.json()) as {
      card_id?: unknown;
      lang?: unknown;
      failed?: unknown;
      price_usd?: unknown;
    };
    if (typeof answer.card_id === "string" && answer.card_id) {
      const price = answer.price_usd;
      return {
        kind: "card",
        cardId: answer.card_id,
        lang: typeof answer.lang === "string" ? answer.lang : "en",
        priceUsd:
          typeof price === "number" && Number.isFinite(price) && price > 0
            ? price
            : null,
      };
    }
    return { kind: "failed", reason: String(answer.failed ?? "no card") };
  } catch (err) {
    serviceDown = true;
    return {
      kind: "unavailable",
      reason: `external identifier unavailable (${describe(err)})`,
    };
  }
}

/**
 * The card with the service's USD price as its price (GET /price/<card id>), for a card chosen
 * by hand, e.g. a correction. Without an identifier, or without an answer within
 * HEALTH_TIMEOUT_MS, the card as it is.
 */
export async function withExternalPrice<T extends { id: string; price: number | null }>(
  card: T,
): Promise<T> {
  if (!externalIdentifierEnabled() || serviceDown) return card;
  try {
    const response = await fetchWithin(
      `${SERVICE_URL}/price/${encodeURIComponent(card.id)}`,
      {},
      HEALTH_TIMEOUT_MS,
    );
    const price = response.ok
      ? ((await response.json()) as { price_usd?: unknown }).price_usd
      : null;
    return typeof price === "number" && Number.isFinite(price) && price > 0
      ? { ...card, price }
      : card;
  } catch {
    return card;
  }
}

function unmatched(outcome: ScanOutcome, reason: string): ScanOutcome {
  const matched = outcome.matched?.diagnostics;
  const base: UnmatchedScanDiagnostics = outcome.noMatch?.diagnostics ?? {
    reason: "external_failed",
    search: null,
    detection: matched?.detection ?? {
      cardDetected: outcome.detectedContour != null,
      sharpness: null,
      confidence: null,
      fallbackReason: null,
    },
    orientation: matched?.orientation ?? "upright",
    matchesNeeded: matched?.matchesNeeded ?? 1,
    attempts: matched?.attempts ?? [],
    ocr: matched?.ocr ?? null,
  };
  return {
    ...outcome,
    card: null,
    alternativeMatches: [],
    matched: null,
    noMatch: {
      diagnostics: { ...base, reason: "external_failed", externalReason: reason },
      embedding: outcome.noMatch?.embedding ?? null,
    },
  };
}

/**
 * Store a card the catalog lacks, with the card cut from this frame as its picture. Returns
 * null when it was stored, else why not.
 */
async function learnFromScan(
  cardId: string,
  canvas: HTMLCanvasElement,
  contour: CardContour | null,
  collectionGuid: string | undefined,
): Promise<string | null> {
  if (!contour) return "no card outline in the frame";
  try {
    const formData = new FormData();
    formData.append("image", await frameAsJpeg(extractCardImage(canvas, contour)), "card.jpg");
    formData.append("cardId", cardId);
    if (collectionGuid) formData.append("collectionGuid", collectionGuid);
    const result = await learnCard(formData);
    return result.success ? null : result.message;
  } catch (err) {
    return describe(err);
  }
}

/**
 * The scan outcome with the external identifier's decision, when one is configured: its card
 * (looked up in this catalog, or learned from this scan when the catalog lacks it) replaces the
 * scanner's match; anything else makes the scan unmatched with the reason. Without one, the
 * outcome unchanged.
 */
export async function withExternalIdentifier(
  outcome: ScanOutcome,
  canvas: HTMLCanvasElement,
  collectionGuid: string | undefined,
  collectionLang?: string,
): Promise<ScanOutcome> {
  if (!externalIdentifierEnabled()) return outcome;
  const scannerCardId = outcome.card?.id ?? null;
  const answer = await identifyExternally(
    canvas,
    outcome.detectedContour,
    scannerCardId,
    collectionLang,
  );
  if (answer.kind !== "card") {
    scanLog(`[scanner] external identifier: ${answer.kind}: ${answer.reason}`);
    return unmatched(outcome, answer.reason);
  }
  scanLog(
    `[scanner] external identifier: ${answer.cardId} (scanner: ${scannerCardId ?? "no match"})`,
  );
  // The service's USD price, when it has one, is the card's price for display and price rules.
  const priced = <T extends { price: number | null }>(card: T): T =>
    answer.priceUsd == null ? card : { ...card, price: answer.priceUsd };
  if (answer.cardId === scannerCardId && outcome.card) {
    return { ...outcome, card: priced(outcome.card), alternativeMatches: [] };
  }
  const lookUp = () => getCardById(answer.cardId, collectionGuid, answer.lang);
  try {
    let found = await lookUp();
    if (!found.data) {
      const notLearned = await learnFromScan(
        answer.cardId,
        canvas,
        outcome.detectedContour,
        collectionGuid,
      );
      if (notLearned) {
        return unmatched(
          outcome,
          `not in Mault's catalog and not learned: ${answer.cardId} (${notLearned})`,
        );
      }
      scanLog(`[scanner] learned ${answer.cardId} from this scan`);
      found = await lookUp();
    }
    if (found.data) {
      return {
        ...outcome,
        card: priced({ ...found.data, distance: 0 }),
        alternativeMatches: [],
        matched: outcome.matched && {
          ...outcome.matched,
          lowConfidenceMatch: false,
        },
      };
    }
  } catch (err) {
    return unmatched(
      outcome,
      `${answer.cardId} could not be looked up (${describe(err)})`,
    );
  }
  return unmatched(outcome, `not in Mault's catalog: ${answer.cardId}`);
}

export interface OwnPrice {
  priceUsd: number | null;
  links: { label: string; url: string }[];
}

/**
 * The owner's own price (USD) of a scanned copy, which the external service keeps rather than
 * Mault: GET /scans/<scan guid>/price answers { price_usd, links: [{ label, url }] } (where to look
 * a price up), or 404 for a scan it never read. null when no service is set up or it doesn't know
 * the scan.
 */
export async function fetchOwnPrice(scanId: string): Promise<OwnPrice | null> {
  if (!externalIdentifierEnabled()) return null;
  const response = await fetchWithin(
    `${SERVICE_URL}/scans/${encodeURIComponent(scanId)}/price`,
    {},
    HEALTH_TIMEOUT_MS * 2,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`the price service answered ${response.status}`);
  const body = (await response.json()) as {
    price_usd?: number | null;
    links?: { label?: unknown; url?: unknown }[];
  };
  const links = (body.links ?? []).flatMap((link) =>
    typeof link.label === "string" &&
    typeof link.url === "string" &&
    link.url.startsWith("https://")
      ? [{ label: link.label, url: link.url }]
      : [],
  );
  return { priceUsd: typeof body.price_usd === "number" ? body.price_usd : null, links };
}

/**
 * Saves (or, with null, clears) the owner's price: POST /scans/<scan guid>/price { price_usd }.
 * Answers what the service did with it ("sent" to the store, or kept for the card's draft).
 */
export async function saveOwnPrice(scanId: string, priceUsd: number | null): Promise<string> {
  const response = await fetchWithin(
    `${SERVICE_URL}/scans/${encodeURIComponent(scanId)}/price`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price_usd: priceUsd }),
    },
    EXTERNAL_IDENTIFY_TIMEOUT_MS,
  );
  const body = (await response.json().catch(() => ({}))) as { store?: string; error?: string };
  if (!response.ok) throw new Error(body.error ?? `the price service answered ${response.status}`);
  return body.store ?? "";
}
