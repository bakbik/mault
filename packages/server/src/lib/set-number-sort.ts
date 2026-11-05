import { SET_NUMBER_SORT_ASC, SET_NUMBER_SORT_DESC } from "@magic-vault/shared";
import { sql, type SQL } from "drizzle-orm";

export function setNumberSortDirection(
  sort: string | null,
): "asc" | "desc" | null {
  if (sort === SET_NUMBER_SORT_ASC) return "asc";
  if (sort === SET_NUMBER_SORT_DESC) return "desc";
  return null;
}

const LEADING_NON_DIGITS = "^[^0-9]*";
// First number after any prefix; a decimal part keeps me02.5 after me02.
const SET_NUMBER = String.raw`^[^0-9]*([0-9]+(?:\.[0-9]+)?)`;
const FIRST_DIGITS = "[0-9]+";
const AFTER_FIRST_DIGITS = "^[^0-9]*[0-9]+(.*)$";

const SET = sql`COALESCE(cc.card_set, '')`;
// "073/111" sorts as 073; prefixes such as TG or RC are compared in upper case.
const NUMBER = sql`upper(btrim(split_part(COALESCE(cc.card_collector_number, ''), '/', 1)))`;

/**
 * Orders saved cards by set and collector number, reading both naturally:
 * 2 before 10, swsh9 before swsh12, plain numbers before prefixed ones
 * (RC2, TG05) grouped by prefix, and 92 before 92a. Cards without a set or
 * a number come last in either direction. Ties are left to the caller.
 */
export function setNumberOrderSql(dir: "asc" | "desc"): SQL {
  const d = dir === "asc" ? sql`ASC` : sql`DESC`;
  const keys: SQL[] = [
    sql`(${SET} = '') ASC`,
    sql`lower(substring(${SET} from ${LEADING_NON_DIGITS}::text)) COLLATE "C" ${d}`,
    sql`(substring(${SET} from ${SET_NUMBER}::text))::numeric ${d} NULLS LAST`,
    sql`lower(${SET}) COLLATE "C" ${d}`,
    sql`${SET} COLLATE "C" ${d}`,
    sql`(${NUMBER} = '') ASC`,
    sql`(substring(${NUMBER} from ${LEADING_NON_DIGITS}::text) <> '') ${d}`,
    sql`substring(${NUMBER} from ${LEADING_NON_DIGITS}::text) COLLATE "C" ${d}`,
    sql`(substring(${NUMBER} from ${FIRST_DIGITS}::text))::numeric ${d} NULLS LAST`,
    sql`COALESCE(substring(${NUMBER} from ${AFTER_FIRST_DIGITS}::text), '') COLLATE "C" ${d}`,
    sql`${NUMBER} COLLATE "C" ${d}`,
  ];
  return sql.join(keys, sql`, `);
}
