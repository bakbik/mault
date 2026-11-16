import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { OwnerPriceMark } from "@/features/cards/components/owner-price-mark";

it("marks a price the owner typed", () => {
  render(<OwnerPriceMark card={{ ownerPrice: 4.5 }} />);
  expect(screen.getByRole("img")).toBeTruthy();
});

it("leaves a market price unmarked", () => {
  render(<OwnerPriceMark card={{}} />);
  expect(screen.queryByRole("img")).toBeNull();
});

it("marks a price of nothing the owner typed", () => {
  render(<OwnerPriceMark card={{ ownerPrice: 0 }} />);
  expect(screen.getByRole("img")).toBeTruthy();
});
