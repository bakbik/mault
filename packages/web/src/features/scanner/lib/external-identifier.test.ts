import { describe, expect, it } from "vitest";
import { servicePicture, withServicePicture } from "@/features/scanner/lib/external-identifier";

const PICTURE = {
  small: "/card-images/zh-cn/CSV8C/149/low.webp",
  normal: "/card-images/zh-cn/CSV8C/149/high.webp",
};

describe("the external service's picture of a card", () => {
  it("is taken when it is one of this install's own card pictures", () => {
    expect(servicePicture(PICTURE)).toEqual(PICTURE);
  });

  it("is refused anywhere else", () => {
    for (const bad of [
      null,
      "x",
      { small: PICTURE.small },
      { ...PICTURE, normal: "https://example.com/high.webp" },
      { ...PICTURE, small: "/card-images/../api/secret.webp" },
      { ...PICTURE, normal: "/api/cards/1" },
    ]) {
      expect(servicePicture(bad)).toBeNull();
    }
  });

  it("becomes the scanned card's picture", () => {
    const card = { id: "CSV8C-149", image: { small: "twin-low", normal: "twin-high" } };
    expect(withServicePicture(card, PICTURE).image).toEqual(PICTURE);
    expect(withServicePicture(card, null)).toBe(card);
  });
});
