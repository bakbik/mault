import type { SyncSource, SyncSourceCard } from "../../interfaces/card-search";
import { withRawData } from "../../card-search/with-raw-data";
import { CARD_API_HEADERS } from "../../constants/card-search";
import { POKEMON_DEFAULT_URL } from "../../constants/urls";
import {
  POKEMON_DETAIL_CONCURRENCY,
  POKEMON_DETAIL_LOG_EVERY,
  POKEMON_DETAIL_RETRY_DELAYS_MS,
  POKEMON_DIGITAL_ONLY_SERIES_IDS,
  POKEMON_SYNC_PAGE_LIMIT,
} from "../../constants/sync";
import type {
  PokemonCardBrief,
  PokemonCardDetail,
  PokemonSeries,
} from "../../interfaces/pokemon";
import { fetchDetail } from "./search";

function highResUrl(image: string | undefined): string | undefined {
  return image ? `${image}/high.webp` : undefined;
}

function localizedUrl(baseUrl: string, lang?: string): string {
  if (!lang) return baseUrl;
  return baseUrl.replace(/\/v2\/[^/]+\//, `/v2/${lang}/`);
}

function toSyncCard(raw: PokemonCardBrief | PokemonCardDetail): SyncSourceCard {
  const setCode =
    ("set" in raw ? raw.set?.id : undefined) ?? raw.id.split("-")[0] ?? "";
  return withRawData(
    { id: raw.id, name: raw.name, setCode, imageUrl: highResUrl(raw.image) },
    raw,
  );
}

/**
 * The brief listing has no set, rarity or type, so a card stored from it shows up blank. The list
 * runs in card-number order across sets, so a short outage at the source hits a whole stretch of
 * numbers (every set's 28-31, say) and the immediate second try lands in the same outage: cards
 * that failed are tried again after each pause in `retryDelaysMs`.
 */
export async function fetchDetails(
  briefs: PokemonCardBrief[],
  baseUrl: string,
  addLog: (msg: string) => void,
  signal?: AbortSignal,
  retryDelaysMs: readonly number[] = POKEMON_DETAIL_RETRY_DELAYS_MS,
): Promise<SyncSourceCard[]> {
  addLog(`Fetching full details for ${briefs.length} cards...`);

  const results: SyncSourceCard[] = new Array(briefs.length);
  let failed: number[] = [];

  async function fetchAll(indexes: number[], logProgress: boolean): Promise<void> {
    let next = 0;
    let done = 0;
    async function worker(): Promise<void> {
      while (next < indexes.length && !signal?.aborted) {
        const index = indexes[next++];
        const brief = briefs[index];
        const detail =
          (await fetchDetail(brief.id, baseUrl, signal).catch(() => null)) ??
          (await fetchDetail(brief.id, baseUrl, signal).catch(() => null));
        if (detail) results[index] = toSyncCard(detail);
        else {
          results[index] ??= toSyncCard(brief);
          failed.push(index);
        }

        done++;
        if (logProgress && done % POKEMON_DETAIL_LOG_EVERY === 0) {
          addLog(`Fetched details for ${done}/${indexes.length} cards...`);
        }
      }
    }
    await Promise.all(Array.from({ length: POKEMON_DETAIL_CONCURRENCY }, worker));
    if (signal?.aborted) throw new Error("Pokémon detail fetch aborted");
  }

  await fetchAll(briefs.map((_, index) => index), true);
  for (const delayMs of retryDelaysMs) {
    if (failed.length === 0) break;
    const retry = failed.sort((a, b) => a - b);
    failed = [];
    addLog(`${retry.length} cards' details failed; trying them again in ${Math.round(delayMs / 1000)} s...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await fetchAll(retry, false);
  }

  if (failed.length > 0) {
    const ids = failed.sort((a, b) => a - b).map((index) => briefs[index].id);
    addLog(
      `${ids.length} cards' details could not be fetched; stored their brief listing instead: ${ids.join(", ")}`,
    );
  }
  return results;
}

async function fetchCards(
  baseUrl: string,
  addLog: (msg: string) => void,
  lang?: string,
  signal?: AbortSignal,
): Promise<SyncSourceCard[]> {
  addLog("Fetching Pokémon TCG catalog...");

  const listUrl = localizedUrl(baseUrl, lang);
  const all: PokemonCardBrief[] = [];
  let page = 1;
  for (;;) {
    const url = `${listUrl}?pagination:page=${page}&pagination:itemsPerPage=${POKEMON_SYNC_PAGE_LIMIT}`;
    const res = await fetch(url, { headers: CARD_API_HEADERS, signal });
    if (!res.ok)
      throw new Error(`Pokémon card list fetch failed: ${res.status}`);

    const rows = (await res.json()) as PokemonCardBrief[];
    all.push(...rows);
    addLog(`Fetched ${all.length} cards so far...`);

    if (rows.length < POKEMON_SYNC_PAGE_LIMIT) break;
    page += 1;
  }

  const digitalOnlySetIds = await fetchDigitalOnlySetIds(listUrl, signal);
  const printed = all.filter(
    (brief) => !digitalOnlySetIds.has(briefSetId(brief)),
  );
  if (printed.length < all.length) {
    addLog(
      `Skipped ${all.length - printed.length} digital-only cards (Pokémon TCG Pocket).`,
    );
  }

  return fetchDetails(printed, listUrl, addLog, signal);
}

function briefSetId(brief: PokemonCardBrief): string {
  return brief.id.slice(0, -(brief.localId.length + 1));
}

async function fetchDigitalOnlySetIds(
  listUrl: string,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const setIds = new Set<string>();
  for (const seriesId of POKEMON_DIGITAL_ONLY_SERIES_IDS) {
    const url = listUrl.replace(/\/cards$/, `/series/${seriesId}`);
    const res = await fetch(url, { headers: CARD_API_HEADERS, signal });
    if (res.status === 404) continue;
    if (!res.ok)
      throw new Error(`Pokémon series ${seriesId} fetch failed: ${res.status}`);
    const series = (await res.json()) as PokemonSeries;
    for (const set of series.sets) setIds.add(set.id);
  }
  return setIds;
}

async function fetchOne(id: string, baseUrl: string, lang?: string) {
  const url = `${localizedUrl(baseUrl, lang)}/${id}`;
  const raw = await fetchDetail(id, localizedUrl(baseUrl, lang));
  if (!raw) return { card: null, urls: [url] };
  return { card: toSyncCard(raw), urls: [url] };
}

export const pokemonSyncSource: SyncSource = {
  gameKey: "pokemon",
  label: "Pokémon (TCGdex)",
  defaultUrl: POKEMON_DEFAULT_URL,
  fetchHeaders: CARD_API_HEADERS,
  languages: [
    "en",
    "fr",
    "es",
    "it",
    "pt",
    "pt-br",
    "pt-pt",
    "de",
    "nl",
    "ru",
    "ja",
    "ko",
    "zh-tw",
    "id",
    "th",
    "zh-cn",
  ],
  fetchCards,
  fetchOne,
};
