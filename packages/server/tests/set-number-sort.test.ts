import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import pg from "pg";
import {
  DEFAULT_CARD_SORT,
  SET_NUMBER_SORT_ASC,
  SET_NUMBER_SORT_DESC,
} from "@magic-vault/shared";
import {
  setNumberSortDirection,
  setNumberOrderSql,
} from "../src/lib/set-number-sort";
import { cardOrderSql, cardSortKeySql } from "../src/routes/collections/cards-query";

test("set number sort: only its own keys turn it on", () => {
  assert.equal(setNumberSortDirection(SET_NUMBER_SORT_ASC), "asc");
  assert.equal(setNumberSortDirection(SET_NUMBER_SORT_DESC), "desc");
  assert.equal(setNumberSortDirection(DEFAULT_CARD_SORT), null);
  assert.equal(setNumberSortDirection(null), null);
  assert.equal(setNumberSortDirection("rarity-asc"), null);
  assert.equal(setNumberSortDirection("set-number-sideways"), null);
});

test("set number sort: orders by the saved card's set and collector number", () => {
  const { sql: text } = new PgDialect().sqlToQuery(setNumberOrderSql("asc"));
  assert.match(text, /cc\.card_set/);
  assert.match(text, /cc\.card_collector_number/);
  // The caller adds its own tie-break: scan order in a collection, the stored
  // position in a storage box.
  assert.doesNotMatch(text, /scanned_at/);
});

test("set number sort: is the card sort key for its own keys only", () => {
  const dialect = new PgDialect();
  const key = cardSortKeySql(SET_NUMBER_SORT_DESC, []);
  assert.ok(key);
  assert.equal(
    dialect.sqlToQuery(key).sql,
    dialect.sqlToQuery(setNumberOrderSql("desc")).sql,
  );
  assert.equal(cardSortKeySql(DEFAULT_CARD_SORT, []), null);
});

test("set number sort: a collection still breaks ties newest first", () => {
  const { sql: text } = new PgDialect().sqlToQuery(
    cardOrderSql(SET_NUMBER_SORT_ASC, []),
  );
  assert.match(text, /cc\.card_set/);
  assert.match(text, /cc\.scanned_at DESC, cc\.id DESC$/);
});

// [set, collector number] in the expected ascending order.
const ASCENDING: [string, string][] = [
  ["me02", "5"],
  ["me02.5", "1"],
  ["S6a", "1"],
  ["S6H", "1"],
  ["sv3pt5", "151"],
  ["sv04", "2"],
  ["sv04", "10"],
  ["sv04", "073/111"],
  ["sv04", "92"],
  ["sv04", "92a"],
  ["sv04", "ONE"],
  ["sv04", "RC2"],
  ["sv04", "TG05"],
  ["sv04", "TG10"],
  ["sv04", ""],
  ["SV5K", "042"],
  ["swsh9", "TG05"],
  ["swsh12", "1"],
  ["", "3"],
];

// Descending reverses sets and numbers, but cards without a set or a number
// still come last.
const DESCENDING: [string, string][] = [
  ["swsh12", "1"],
  ["swsh9", "TG05"],
  ["SV5K", "042"],
  ["sv04", "TG10"],
  ["sv04", "TG05"],
  ["sv04", "RC2"],
  ["sv04", "ONE"],
  ["sv04", "92a"],
  ["sv04", "92"],
  ["sv04", "073/111"],
  ["sv04", "10"],
  ["sv04", "2"],
  ["sv04", ""],
  ["sv3pt5", "151"],
  ["S6H", "1"],
  ["S6a", "1"],
  ["me02.5", "1"],
  ["me02", "5"],
  ["", "3"],
];

async function orderInPostgres(
  url: string,
  dir: "asc" | "desc",
): Promise<string[]> {
  // Shuffled input, every row scanned at the same moment, so only the
  // set number key can produce the expected order.
  const rows = [...ASCENDING].reverse().map(([set, number], i) =>
    sql`(${i + 1}::int, timestamp '2026-01-01', ${set}::text, ${number}::text)`,
  );
  const query = new PgDialect().sqlToQuery(sql`
    SELECT cc.card_set || ' ' || cc.card_collector_number AS label
    FROM (VALUES ${sql.join(rows, sql`, `)})
      AS cc(id, scanned_at, card_set, card_collector_number)
    ORDER BY ${setNumberOrderSql(dir)}`);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ label: string }>(query.sql, query.params);
    return result.rows.map((row) => row.label);
  } finally {
    await client.end();
  }
}

const label = ([set, number]: [string, string]) => `${set} ${number}`;
const databaseUrl = process.env.DATABASE_URL;

test(
  "set number sort: sets stay together, numbers read naturally (Postgres)",
  { skip: databaseUrl ? false : "needs DATABASE_URL" },
  async () => {
    assert.deepEqual(
      await orderInPostgres(databaseUrl!, "asc"),
      ASCENDING.map(label),
    );
    assert.deepEqual(
      await orderInPostgres(databaseUrl!, "desc"),
      DESCENDING.map(label),
    );
  },
);
