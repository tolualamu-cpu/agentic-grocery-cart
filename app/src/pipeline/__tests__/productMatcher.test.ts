import { describe, expect, it } from "vitest";
import type { GroceryNeed, UserPreferences } from "@/domain/grocery";
import { catalogProductMatcher, searchCatalogProducts } from "@/pipeline/productMatcher";

const preferences: UserPreferences = {
  optimizationGoal: "cheapest",
  maxStores: 2,
  fulfillmentMode: "pickup",
  organicPreference: "none",
  brandFlexibility: "flexible",
  budgetTarget: 55,
};

const lambNeed: GroceryNeed = {
  id: "need-1",
  canonicalName: "lamb",
  displayName: "Lamb",
  category: "meat",
  quantity: 1.5,
  unit: "lb",
  source: "recipe",
  confidence: 0.92,
  constraints: {
    substitutionPolicy: "similar",
  },
};

describe("CatalogProductMatcher", () => {
  it("returns ranked candidates with reasons for inferred needs", () => {
    const candidates = catalogProductMatcher.findCandidates(lambNeed, preferences);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].offer.productId).toBe("lamb");
    expect(candidates[0].reasons.length).toBeGreaterThan(0);
  });

  it("filters candidates when organic is required", () => {
    const candidates = catalogProductMatcher.findCandidates(
      {
        ...lambNeed,
        canonicalName: "cucumber",
        displayName: "Cucumber",
        category: "produce",
        quantity: 2,
        unit: "ct",
        constraints: {
          organic: true,
          substitutionPolicy: "flexible",
        },
      },
      {
        ...preferences,
        organicPreference: "required",
      },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].offer.organic).toBe(true);
  });

  it("ranks organic candidates higher when organic is preferred", () => {
    const candidates = catalogProductMatcher.findCandidates(
      {
        ...lambNeed,
        canonicalName: "eggs",
        displayName: "Eggs",
        category: "dairy",
        quantity: 12,
        unit: "ct",
      },
      {
        ...preferences,
        optimizationGoal: "best_value",
        organicPreference: "prefer",
      },
    );

    expect(candidates[0].offer.organic).toBe(true);
    expect(candidates[0].reasons).toContain("Organic option matches the preference.");
  });

  it("ranks non-organic candidates higher when non-organic is preferred", () => {
    const candidates = catalogProductMatcher.findCandidates(
      {
        ...lambNeed,
        canonicalName: "eggs",
        displayName: "Eggs",
        category: "dairy",
        quantity: 12,
        unit: "ct",
      },
      {
        ...preferences,
        optimizationGoal: "best_value",
        organicPreference: "prefer_non_organic",
      },
    );

    expect(candidates[0].offer.organic).not.toBe(true);
    expect(candidates[0].reasons).toContain("Non-organic option matches the preference.");
    expect(candidates.some((candidate) => candidate.warnings.includes("Organic item is available, but the current preference leans non-organic."))).toBe(true);
  });

  it("does not return candidates for unsupported needs", () => {
    const candidates = catalogProductMatcher.findCandidates(
      {
        ...lambNeed,
        canonicalName: "moon milk",
        displayName: "Moon milk",
        category: "pantry",
      },
      preferences,
    );

    expect(candidates).toHaveLength(0);
  });

  it("does not use loose product matches for strict substitution needs", () => {
    const candidates = catalogProductMatcher.findCandidates(
      {
        ...lambNeed,
        canonicalName: "protein",
        displayName: "Protein",
        category: "meat",
        constraints: {
          substitutionPolicy: "strict",
        },
      },
      preferences,
    );

    expect(candidates).toHaveLength(0);
  });

  it("searches catalog products by canonical name, alias, and tag", () => {
    expect(searchCatalogProducts("flatbread").map((product) => product.canonicalName)).toContain("pita bread");
    expect(searchCatalogProducts("greek yogurt").map((product) => product.canonicalName)).toContain("plain yogurt");
    expect(searchCatalogProducts("protein").map((product) => product.canonicalName)).toContain("chicken breast");
  });

  it("retrieves ontology-based semantic add-item suggestions", () => {
    expect(searchCatalogProducts("breakfast protein").map((product) => product.canonicalName)).toEqual(
      expect.arrayContaining(["eggs", "plain yogurt", "turkey sausage", "peanut butter"]),
    );
    expect(searchCatalogProducts("plant based milk").map((product) => product.canonicalName)).toEqual(
      expect.arrayContaining(["oat milk", "almond milk", "coconut milk"]),
    );
    expect(searchCatalogProducts("sandwich stuff").map((product) => product.canonicalName)).toEqual(
      expect.arrayContaining(["sandwich bread", "deli turkey", "sliced cheese"]),
    );
  });

  it("turns taxonomy-matched needs into normal product candidates", () => {
    const candidates = catalogProductMatcher.findCandidates(
      {
        ...lambNeed,
        canonicalName: "almond milk",
        displayName: "Almond milk",
        category: "dairy",
        quantity: 1,
        unit: "carton",
        constraints: {
          dietaryTags: ["dairy-free"],
          substitutionPolicy: "similar",
        },
      },
      preferences,
    );

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].offer.productId).toBe("almond-milk");
    expect(candidates[0].reasons.length).toBeGreaterThan(0);
  });

  it("uses Phase 2.5 search quality rules for add-item product search", () => {
    expect(searchCatalogProducts("moon milk")).toHaveLength(0);
    expect(searchCatalogProducts("dairy free milk").map((product) => product.canonicalName).slice(0, 2)).toEqual(
      expect.arrayContaining(["oat milk", "coconut milk"]),
    );
    expect(searchCatalogProducts("dary free milk").map((product) => product.canonicalName).slice(0, 2)).toEqual(
      expect.arrayContaining(["oat milk", "coconut milk"]),
    );
    expect(searchCatalogProducts("lactose free milk").map((product) => product.canonicalName).slice(0, 2)).toEqual(
      expect.arrayContaining(["oat milk", "coconut milk"]),
    );
    expect(searchCatalogProducts("dary free moon milk")).toHaveLength(0);
  });
});
