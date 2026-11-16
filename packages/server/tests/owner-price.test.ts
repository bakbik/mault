import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  cardPriceAtScanFor,
  cardPriceFor,
  DEFAULT_ORG_PRICING,
  type PlayingCard,
} from "@magic-vault/shared";
import {
  joinedScannedCardPriceSql,
  scannedCardPriceSql,
} from "../src/lib/card-price-sql";
import { CC_ALIAS_SQL_COLUMNS } from "../src/lib/constants/card-prices";
import { toApiScannedCard } from "../src/lib/public-api/cards";
import type { PublicApiCardRow } from "../src/lib/interfaces/public-api";
import { hydrateSavedCards, slimSavedCardSnapshots } from "../src/lib/saved-cards";
import { parseOwnerPrice } from "../src/lib/owner-price";
import { toScannedCard } from "../src/routes/collections/shared";

const card = {
  id: "151C-068",
  name: "怪力",
  image: null,
  price: 1.2,
  priceFoil: 3.4,
} as PlayingCard;

test("a copy's own price comes before any market price in Mault's totals", () => {
  const dialect = new PgDialect();
  const joined = dialect.sqlToQuery(
    joinedScannedCardPriceSql(DEFAULT_ORG_PRICING, CC_ALIAS_SQL_COLUMNS, "cp"),
  ).sql;
  assert.match(joined, /^COALESCE\(cc\.owner_price, /);
  assert.match(dialect.sqlToQuery(scannedCardPriceSql(DEFAULT_ORG_PRICING)).sql, /"owner_price"/);
});

test("a copy's own price is shown as it is, whatever its finish and condition", () => {
  const owned = { ...card, ownerPrice: 4.5 };
  assert.equal(cardPriceFor(owned, { isFoil: true, foilType: "Holo" }, "tcgplayer", "HP"), 4.5);
  assert.equal(cardPriceFor(owned, false, "cardkingdom"), 4.5);
  assert.equal(cardPriceFor(card, false, "tcgplayer"), 1.2);
});

test("a copy's own price (USD) is not shown as a price in euros", () => {
  const owned = { ...card, ownerPrice: 4.5, priceEur: 0.9 };
  assert.equal(cardPriceFor(owned, false, "cardmarket"), 0.9);
  const cardmarket = { ...DEFAULT_ORG_PRICING, source: "cardmarket" as const };
  const text = new PgDialect().sqlToQuery(
    joinedScannedCardPriceSql(cardmarket, CC_ALIAS_SQL_COLUMNS, "cp"),
  ).sql;
  assert.doesNotMatch(text, /owner_price/);
});

test("a copy's own price never shows a change since the scan", () => {
  assert.equal(cardPriceAtScanFor({ ...card, ownerPrice: 4.5 }, false, "tcgplayer"), 4.5);
});

test("a copy carries its own price on its card", () => {
  const base = { guid: "s1", card, scannedAt: new Date(0), binNumber: null };
  assert.equal(toScannedCard({ ...base, ownerPrice: 4.5 }).card.ownerPrice, 4.5);
  assert.equal("ownerPrice" in toScannedCard({ ...base, ownerPrice: null }).card, false);
});

test("a copy in a storage box carries its own price", async () => {
  const [owned, plain] = await hydrateSavedCards(
    [
      { gameKey: null, lang: "zh-cn", card, ownerPrice: 4.5 },
      { gameKey: null, lang: "zh-cn", card, ownerPrice: null },
    ],
    { includeRaw: false },
  );
  assert.equal(owned.ownerPrice, 4.5);
  assert.equal(plain.ownerPrice, undefined);
});

test("a copy's own price is never saved into its card snapshot", () => {
  const scope = { gameKey: "pokemon", lang: "zh-cn" };
  const owned = { ...card, ownerPrice: 4.5 };
  for (const inCatalog of [new Set(["pokemon\u0000zh-cn\u0000151C-068"]), new Set<string>()]) {
    const { card: saved } = slimSavedCardSnapshots(scope, owned, null, inCatalog);
    assert.equal("ownerPrice" in saved, false);
  }
});

test("the price typed for a copy is checked", () => {
  assert.equal(parseOwnerPrice(undefined), undefined);
  assert.equal(parseOwnerPrice(null), null);
  assert.equal(parseOwnerPrice(4.555), 4.56);
  assert.equal(parseOwnerPrice(0), 0);
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001, "4.5", true]) {
    assert.throws(() => parseOwnerPrice(bad), /price/i);
  }
});

test("the public API and its webhooks tell a copy's own price", () => {
  const row = {
    scan_id: "s1",
    card_id: "151C-068",
    is_foil: false,
    foil_type: null,
    stamp: null,
    condition: "NM",
    name: "怪力",
    set_code: "151C",
    set_name: "151",
    collector_number: "068",
    rarity: "R",
    tcgplayer_product_id: null,
    price_usd: "1.2",
    price_usd_foil: null,
    price_eur: null,
    price_eur_foil: null,
    price_usd_printing: null,
    price_usd_owner: 4.5,
    stored_price_details: {},
    saved_price_details: {},
    collection_guid: "c1",
    collection_name: "Pokemon",
    lang: "zh-cn",
    game: "pokemon",
    location_guid: null,
    location_name: null,
    location_position: null,
    needs_review: false,
    is_reviewed: false,
    scanned_at: "2026-11-16T00:00:00.000Z",
    created_at: "2026-11-16T00:00:00.000Z",
    updated_at: "2026-11-16T00:00:00.000Z",
  } as unknown as PublicApiCardRow;
  assert.equal(toApiScannedCard(row).prices.usd_owner, "4.50");
  assert.equal(toApiScannedCard({ ...row, price_usd_owner: null }).prices.usd_owner, null);
});
