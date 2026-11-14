import { describe, expect, it } from "vitest";
import type { CardContour } from "@magic-vault/shared";
import { dewarpShowsCardUpsideDown } from "./perspective-warp";

// A sorter frame: the card lies sideways, and the detector named its far right corner topLeft.
const outline: CardContour = {
  topLeft: { x: 3108, y: 259 },
  topRight: { x: 3128, y: 1985 },
  bottomRight: { x: 632, y: 2053 },
  bottomLeft: { x: 692, y: 248 },
};

describe("dewarpShowsCardUpsideDown", () => {
  it("is upside down when the printed top left is the outline's bottomRight", () => {
    expect(dewarpShowsCardUpsideDown(outline, { x: 602, y: 2038 })).toBe(true);
  });

  it("is upright when the printed top left is the outline's topLeft", () => {
    expect(dewarpShowsCardUpsideDown(outline, { x: 3090, y: 270 })).toBe(false);
  });

  it("says nothing for a corner a quarter turn off", () => {
    expect(dewarpShowsCardUpsideDown(outline, { x: 700, y: 260 })).toBe(false);
    expect(dewarpShowsCardUpsideDown(outline, { x: 3120, y: 1970 })).toBe(false);
  });
});
