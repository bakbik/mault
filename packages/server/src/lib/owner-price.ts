/** The highest price (USD) the owner can type for one copy. */
export const MAX_OWNER_PRICE = 1_000_000;

/**
 * The owner's own price of a copy as sent to the copy's edit route: undefined leaves it as it is,
 * null clears it, and a number from 0 to MAX_OWNER_PRICE is kept to the cent. Anything else
 * throws.
 */
export function parseOwnerPrice(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_OWNER_PRICE) {
    throw new Error(`Your price must be a number of dollars from 0 to ${MAX_OWNER_PRICE}.`);
  }
  return Math.round(value * 100) / 100;
}
