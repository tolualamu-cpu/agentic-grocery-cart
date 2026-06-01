import { describe, expect, it } from "vitest";
import type { GroceryNeed, ProductCandidate } from "@/domain/grocery";
import { offers, stores } from "@/data/mockCatalog";
import { getLineTotal, getNeedQuantityForPackageCount, getPackageCount } from "@/pipeline/pricing";

function candidateFor(offerId: string): ProductCandidate {
  const offer = offers.find((item) => item.id === offerId);

  if (!offer) {
    throw new Error(`Missing offer ${offerId}`);
  }

  const store = stores.find((item) => item.id === offer.storeId);

  if (!store) {
    throw new Error(`Missing store ${offer.storeId}`);
  }

  return {
    needId: "need-1",
    offer,
    store,
    matchScore: 90,
    quantityCoverage: 1,
    unitPrice: offer.price,
    reasons: [],
    warnings: [],
  };
}

const baseNeed: GroceryNeed = {
  id: "need-1",
  canonicalName: "romaine lettuce",
  displayName: "Romaine lettuce",
  category: "produce",
  quantity: 1,
  unit: "pack",
  source: "manual_list",
  confidence: 0.9,
  constraints: {
    substitutionPolicy: "similar",
  },
};

describe("pricing helpers", () => {
  it("charges one package for a one-pack need", () => {
    const candidate = candidateFor("kr-romaine");

    expect(getPackageCount(baseNeed, candidate)).toBe(1);
    expect(getLineTotal(baseNeed, candidate)).toBeCloseTo(3.69);
  });

  it("charges multiple packages when the need quantity is increased", () => {
    const candidate = candidateFor("kr-romaine");

    expect(getPackageCount({ ...baseNeed, quantity: 3 }, candidate)).toBe(3);
    expect(getLineTotal({ ...baseNeed, quantity: 3 }, candidate)).toBeCloseTo(11.07);
  });

  it("rounds up package count for unit-based quantities", () => {
    const candidate = candidateFor("wm-chicken");
    const need: GroceryNeed = {
      ...baseNeed,
      canonicalName: "chicken breast",
      displayName: "Chicken breast",
      quantity: 5,
      unit: "lb",
    };

    expect(getPackageCount(need, candidate)).toBe(3);
    expect(getLineTotal(need, candidate)).toBeCloseTo(32.94);
  });

  it("converts cart picker package count back into a need quantity", () => {
    const candidate = candidateFor("wm-chicken");
    const need: GroceryNeed = {
      ...baseNeed,
      canonicalName: "chicken breast",
      displayName: "Chicken breast",
      quantity: 2,
      unit: "lb",
    };

    const nextNeed = {
      ...need,
      quantity: getNeedQuantityForPackageCount(need, candidate, 2),
    };

    expect(nextNeed.quantity).toBe(4.5);
    expect(getPackageCount(nextNeed, candidate)).toBe(2);
    expect(getLineTotal(nextNeed, candidate)).toBeCloseTo(21.96);
  });

  it("keeps package-like units aligned with the cart picker count", () => {
    const candidate = candidateFor("kr-romaine");
    const nextNeed = {
      ...baseNeed,
      quantity: getNeedQuantityForPackageCount(baseNeed, candidate, 4),
    };

    expect(nextNeed.quantity).toBe(4);
    expect(getPackageCount(nextNeed, candidate)).toBe(4);
    expect(getLineTotal(nextNeed, candidate)).toBeCloseTo(14.76);
  });
});
