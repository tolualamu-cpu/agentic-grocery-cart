import { describe, expect, it } from "vitest";
import type { GroceryNeed, OptimizationGoal, UserPreferences } from "@/domain/grocery";
import { generateGroceryNeeds } from "@/pipeline/needs";
import { buildOptimizedCart } from "@/pipeline/optimizer";

const preferences: UserPreferences = {
  optimizationGoal: "cheapest",
  maxStores: 2,
  fulfillmentMode: "pickup",
  organicPreference: "none",
  brandFlexibility: "flexible",
  budgetTarget: 55,
};

function testNeed(overrides: Partial<GroceryNeed> & Pick<GroceryNeed, "canonicalName" | "displayName" | "category">): GroceryNeed {
  return {
    id: overrides.id ?? "need-1",
    canonicalName: overrides.canonicalName,
    displayName: overrides.displayName,
    category: overrides.category,
    quantity: overrides.quantity ?? 1,
    unit: overrides.unit ?? "ct",
    source: overrides.source ?? "manual_list",
    confidence: overrides.confidence ?? 0.95,
    constraints: {
      substitutionPolicy: overrides.constraints?.substitutionPolicy ?? "flexible",
      ...overrides.constraints,
    },
  };
}

describe("buildOptimizedCart", () => {
  it("builds a priced cart from known needs", () => {
    const needs = generateGroceryNeeds("milk, sandwich bread, bananas", "manual_list", preferences);
    const cart = buildOptimizedCart(needs, preferences);

    expect(cart.items).toHaveLength(3);
    expect(cart.total).toBeGreaterThan(0);
    expect(cart.stores.length).toBeGreaterThan(0);
    expect(cart.explanations[0]).toContain("cheapest");
    expect(cart.activePlanId).toBe(cart.planOptions[0].id);
    expect(cart.activePlanId).not.toBe("recommended");
    expect(cart.planOptions[0].isRecommended).toBe(true);
    expect(cart.planOptions.length).toBeGreaterThan(1);
    expect(cart.status).toBe("ready");
    expect(cart.unmatchedNeeds).toEqual([]);
  });

  it("returns named cart plan options for visual comparison", () => {
    const needs = generateGroceryNeeds("milk, sandwich bread, bananas", "manual_list", {
      ...preferences,
      organicPreference: "prefer",
    });
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      organicPreference: "prefer",
      maxStores: 3,
    });

    expect(cart.planOptions.map((plan) => plan.id)).toEqual(
      expect.arrayContaining([
        "cheapest-one-store",
        "cheapest-split",
        "fewest-stores",
        "best-value",
        "preferred-brands",
      ]),
    );
    expect(cart.planOptions.map((plan) => plan.id)).not.toContain("recommended");
    expect(cart.planOptions.filter((plan) => plan.isRecommended)).toHaveLength(1);
    expect(cart.planOptions[0].isRecommended).toBe(true);
    expect(cart.activePlanId).toBe(cart.planOptions[0].id);
    expect(cart.planOptions.every((plan) => plan.tradeoffs.length > 0)).toBe(true);
    expect(cart.planOptions.every((plan) => plan.comparisonSummary.length > 0)).toBe(true);
    expect(cart.planOptions.map((plan) => plan.comparisonSummary)).toContain("Lowest cost option");
    expect(cart.planOptions.some((plan) => /^\+\$\d+\.\d{2} vs lowest cost$/.test(plan.comparisonSummary))).toBe(true);
    expect(cart.planOptions.map((plan) => plan.comparisonSummary)).not.toContain(
      "Lowest estimated total among the current comparable plans.",
    );
    expect(cart.planOptions.find((plan) => plan.id === "cheapest-one-store")?.stores).toHaveLength(1);
  });

  it("lets plan options expose strategy-specific item choices", () => {
    const needs = generateGroceryNeeds("eggs", "manual_list", {
      ...preferences,
      organicPreference: "prefer",
    });
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "cheapest",
      organicPreference: "prefer",
      maxStores: 3,
    });
    const recommendedPlan = cart.planOptions.find((plan) => plan.isRecommended);
    const bestValuePlan = cart.planOptions.find((plan) => plan.id === "best-value");

    expect(recommendedPlan?.items[0].selected.offer.organic).not.toBe(true);
    expect(bestValuePlan?.items[0].selected.offer.organic).toBe(true);
    expect(bestValuePlan?.total).toBeGreaterThan(recommendedPlan?.total ?? 0);
  });

  it("applies delivery fees when fulfillment mode is delivery", () => {
    const needs = generateGroceryNeeds("milk, sandwich bread", "manual_list", preferences);
    const pickupCart = buildOptimizedCart(needs, preferences);
    const deliveryCart = buildOptimizedCart(needs, {
      ...preferences,
      fulfillmentMode: "delivery",
    });

    expect(deliveryCart.fees).toBeGreaterThan(pickupCart.fees);
    expect(deliveryCart.total).toBeGreaterThan(pickupCart.total);
  });

  it("warns when cart total exceeds the budget target", () => {
    const needs = generateGroceryNeeds("Cobb salad with chicken and rice", "recipe", preferences);
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      budgetTarget: 10,
    });

    expect(cart.warnings.some((warning) => warning.includes("over the budget"))).toBe(true);
  });

  it("handles empty carts without fake items", () => {
    const cart = buildOptimizedCart([], preferences);

    expect(cart.items).toHaveLength(0);
    expect(cart.total).toBe(0);
    expect(cart.explanations[0]).toContain("No items");
    expect(cart.status).toBe("blocked");
  });

  it.each([
    "cheapest",
    "best_value",
    "fewest_stores",
    "preferred_brands",
  ] satisfies OptimizationGoal[])("builds a valid cart for %s strategy", (optimizationGoal) => {
    const needs = generateGroceryNeeds("milk, sandwich bread, bananas", "manual_list", preferences);
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal,
      maxStores: 3,
    });

    expect(cart.items).toHaveLength(3);
    expect(cart.stores.length).toBeLessThanOrEqual(3);
    expect(cart.total).toBeGreaterThan(0);
    expect(cart.explanations.join(" ")).toContain(optimizationGoal.replace("_", " "));
  });

  it.each([
    "none",
    "prefer",
    "prefer_non_organic",
    "required",
  ] satisfies UserPreferences["organicPreference"][])("builds a valid cart with organic=%s", (organicPreference) => {
    const needs = generateGroceryNeeds("milk, eggs, bananas", "manual_list", {
      ...preferences,
      organicPreference,
    });
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      organicPreference,
      optimizationGoal: "best_value",
      maxStores: 3,
    });

    expect(cart.stores.length).toBeLessThanOrEqual(3);

    if (organicPreference === "required") {
      expect(cart.items).toHaveLength(3);
      expect(cart.items.every((item) => item.selected.offer.organic)).toBe(true);
    } else {
      expect(cart.items).toHaveLength(3);
    }
  });

  it.each([
    "flexible",
    "balanced",
    "strict",
  ] satisfies UserPreferences["brandFlexibility"][])("builds a valid cart with brand flexibility=%s", (brandFlexibility) => {
    const needs = generateGroceryNeeds("milk, sandwich bread, bananas", "manual_list", {
      ...preferences,
      brandFlexibility,
    });
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      brandFlexibility,
      optimizationGoal: "best_value",
      maxStores: 3,
    });

    expect(cart.items).toHaveLength(3);
    expect(cart.total).toBeGreaterThan(0);
  });

  it.each([
    ["cheapest", "none", "flexible"],
    ["cheapest", "prefer", "balanced"],
    ["cheapest", "prefer_non_organic", "balanced"],
    ["best_value", "prefer", "flexible"],
    ["best_value", "prefer_non_organic", "flexible"],
    ["best_value", "required", "strict"],
    ["fewest_stores", "none", "strict"],
    ["preferred_brands", "none", "flexible"],
    ["preferred_brands", "prefer", "balanced"],
    ["preferred_brands", "required", "strict"],
  ] satisfies Array<[OptimizationGoal, UserPreferences["organicPreference"], UserPreferences["brandFlexibility"]]>)(
    "handles combined preferences strategy=%s organic=%s brands=%s",
    (optimizationGoal, organicPreference, brandFlexibility) => {
      const nextPreferences = {
        ...preferences,
        optimizationGoal,
        organicPreference,
        brandFlexibility,
        maxStores: 2,
      };
      const needs = generateGroceryNeeds("milk, eggs, bananas", "manual_list", nextPreferences);
      const cart = buildOptimizedCart(needs, nextPreferences);

      expect(cart.stores.length).toBeLessThanOrEqual(2);
      expect(cart.total).toBeGreaterThan(0);

      if (organicPreference === "required") {
        expect(cart.items.every((item) => item.selected.offer.organic)).toBe(true);
      }
    },
  );

  it("cheapest minimizes the full cart total better than best value for simple staples", () => {
    const needs = generateGroceryNeeds("milk, eggs, bananas", "manual_list", preferences);
    const cheapestCart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "cheapest",
      maxStores: 3,
    });
    const bestValueCart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "best_value",
      organicPreference: "prefer",
      maxStores: 3,
    });

    expect(cheapestCart.total).toBeLessThanOrEqual(bestValueCart.total);
  });

  it("fewest stores prefers one store when a complete one-store cart exists", () => {
    const needs = generateGroceryNeeds("milk, sandwich bread, bananas", "manual_list", preferences);
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "fewest_stores",
      maxStores: 3,
    });

    expect(cart.stores).toHaveLength(1);
    expect(cart.explanations.join(" ")).toContain("Store count");
  });

  it("enforces max stores as a hard cap", () => {
    const needs = generateGroceryNeeds("Cobb salad with chicken and rice", "recipe", preferences);
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      maxStores: 1,
    });

    expect(cart.stores.length).toBeLessThanOrEqual(1);
  });

  it("organic prefer can choose organic under best value without forcing it under cheapest", () => {
    const needs = generateGroceryNeeds("eggs", "manual_list", {
      ...preferences,
      organicPreference: "prefer",
    });
    const cheapestCart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "cheapest",
      organicPreference: "prefer",
    });
    const bestValueCart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "best_value",
      organicPreference: "prefer",
    });

    expect(cheapestCart.items[0].selected.offer.organic).not.toBe(true);
    expect(bestValueCart.items[0].selected.offer.organic).toBe(true);
  });

  it("non-organic preference can choose non-organic under best value", () => {
    const needs = generateGroceryNeeds("eggs", "manual_list", {
      ...preferences,
      organicPreference: "prefer_non_organic",
    });
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "best_value",
      organicPreference: "prefer_non_organic",
    });

    expect(cart.items[0].selected.offer.organic).not.toBe(true);
    expect(cart.explanations.join(" ")).toContain("non-organic");
  });

  it("budget target is a soft signal that can nudge best value toward lower-cost options", () => {
    const needs = generateGroceryNeeds("eggs", "manual_list", {
      ...preferences,
      organicPreference: "prefer",
    });
    const roomyBudgetCart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "best_value",
      organicPreference: "prefer",
      budgetTarget: 20,
    });
    const tightBudgetCart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "best_value",
      organicPreference: "prefer",
      budgetTarget: 2,
    });

    expect(roomyBudgetCart.items[0].selected.offer.organic).toBe(true);
    expect(tightBudgetCart.items[0].selected.offer.organic).not.toBe(true);
    expect(tightBudgetCart.total).toBeLessThan(roomyBudgetCart.total);
    expect(tightBudgetCart.warnings.some((warning) => warning.includes("over the budget target"))).toBe(true);
    expect(tightBudgetCart.explanations.join(" ")).toContain("lower-cost plans were favored");
  });

  it("organic required filters non-organic options and warns when an item cannot be matched", () => {
    const seasoningNeed: GroceryNeed = {
      id: "need-1",
      canonicalName: "shawarma seasoning",
      displayName: "Shawarma seasoning",
      category: "pantry",
      quantity: 1,
      unit: "jar",
      source: "manual_list",
      confidence: 0.95,
      constraints: {
        organic: true,
        substitutionPolicy: "flexible",
      },
    };
    const cart = buildOptimizedCart([seasoningNeed], {
      ...preferences,
      organicPreference: "required",
    });

    expect(cart.items).toHaveLength(0);
    expect(cart.warnings).toContain("No available product matched Shawarma seasoning.");
    expect(cart.status).toBe("blocked");
    expect(cart.unmatchedNeeds[0]).toMatchObject({
      reason: "constraint_conflict",
      blockingConstraints: ["organic"],
    });
  });

  it("returns needs_review for useful partial carts instead of silently dropping missing items", () => {
    const needs = [
      ...generateGroceryNeeds("milk", "manual_list", preferences),
      testNeed({
        id: "need-2",
        canonicalName: "dragon fruit",
        displayName: "Dragon fruit",
        category: "produce",
      }),
    ];
    const cart = buildOptimizedCart(needs, preferences);

    expect(cart.items).toHaveLength(1);
    expect(cart.status).toBe("needs_review");
    expect(cart.unmatchedNeeds).toHaveLength(1);
    expect(cart.unmatchedNeeds[0]).toMatchObject({
      reason: "no_candidate",
      suggestedActions: ["search_manually", "remove_item"],
    });
  });

  it("marks fully unbuildable carts as blocked", () => {
    const cart = buildOptimizedCart([
      testNeed({
        canonicalName: "dragon fruit",
        displayName: "Dragon fruit",
        category: "produce",
      }),
    ], preferences);

    expect(cart.items).toHaveLength(0);
    expect(cart.status).toBe("blocked");
    expect(cart.unmatchedNeeds[0].reason).toBe("no_candidate");
  });

  it("excludes unavailable offers and reports out-of-stock needs", () => {
    const cart = buildOptimizedCart([
      testNeed({
        canonicalName: "sumac",
        displayName: "Sumac",
        category: "pantry",
        unit: "jar",
      }),
    ], preferences);

    expect(cart.items).toHaveLength(0);
    expect(cart.status).toBe("blocked");
    expect(cart.unmatchedNeeds[0]).toMatchObject({
      reason: "out_of_stock",
      blockingConstraints: ["availability"],
    });
  });

  it("keeps hard dietary constraints unmatched when no compatible product exists", () => {
    const cart = buildOptimizedCart([
      testNeed({
        canonicalName: "ranch dressing",
        displayName: "Dairy-free ranch dressing",
        category: "pantry",
        unit: "bottle",
        constraints: {
          dietaryTags: ["dairy-free"],
          substitutionPolicy: "flexible",
        },
      }),
    ], preferences);

    expect(cart.items).toHaveLength(0);
    expect(cart.status).toBe("blocked");
    expect(cart.unmatchedNeeds[0]).toMatchObject({
      reason: "constraint_conflict",
      blockingConstraints: ["dairy-free"],
    });
  });

  it("reports fulfillment unavailable when a matched product cannot use the selected fulfillment mode", () => {
    const cart = buildOptimizedCart([
      testNeed({
        canonicalName: "fresh dill",
        displayName: "Fresh dill",
        category: "produce",
        unit: "bunch",
      }),
    ], {
      ...preferences,
      fulfillmentMode: "delivery",
    });

    expect(cart.items).toHaveLength(0);
    expect(cart.status).toBe("blocked");
    expect(cart.unmatchedNeeds[0]).toMatchObject({
      reason: "fulfillment_unavailable",
      blockingConstraints: ["delivery"],
    });
  });

  it("reports max-store conflicts when every item has candidates but no complete cart fits the cap", () => {
    const needs = [
      testNeed({
        id: "need-1",
        canonicalName: "bacon",
        displayName: "Organic bacon",
        category: "meat",
        quantity: 8,
        unit: "oz",
        constraints: {
          organic: true,
          substitutionPolicy: "similar",
        },
      }),
      testNeed({
        id: "need-2",
        canonicalName: "shawarma seasoning",
        displayName: "Shawarma seasoning",
        category: "pantry",
        unit: "jar",
      }),
    ];
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      maxStores: 1,
    });

    expect(cart.items).toHaveLength(0);
    expect(cart.status).toBe("blocked");
    expect(cart.unmatchedNeeds.every((need) => need.reason === "max_stores_conflict")).toBe(true);
    expect(cart.unmatchedNeeds.every((need) => need.suggestedActions.includes("increase_max_stores"))).toBe(true);
  });

  it("allows soft organic misses when organic is preferred but unavailable", () => {
    const cart = buildOptimizedCart([
      testNeed({
        canonicalName: "shawarma seasoning",
        displayName: "Shawarma seasoning",
        category: "pantry",
        unit: "jar",
      }),
    ], {
      ...preferences,
      organicPreference: "prefer",
      optimizationGoal: "best_value",
    });

    expect(cart.items).toHaveLength(1);
    expect(cart.status).toBe("ready");
    expect(cart.items[0].selected.offer.organic).not.toBe(true);
    expect(cart.unmatchedNeeds).toHaveLength(0);
  });

  it("organic required can now build the full Cobb salad fixture from organic options", () => {
    const needs = generateGroceryNeeds("Cobb salad with chicken and rice", "recipe", {
      ...preferences,
      organicPreference: "required",
    });
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      organicPreference: "required",
      maxStores: 3,
    });

    expect(cart.items).toHaveLength(needs.length);
    expect(cart.items.every((item) => item.selected.offer.organic)).toBe(true);
  });

  it("preferred brands reduces store-brand reliance when comparable branded options exist", () => {
    const needs = generateGroceryNeeds("blue cheese", "manual_list", preferences);
    const cheapestCart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "cheapest",
      brandFlexibility: "flexible",
    });
    const preferredBrandCart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "preferred_brands",
      brandFlexibility: "strict",
    });

    expect(cheapestCart.items[0].selected.offer.storeBrand).toBe(true);
    expect(preferredBrandCart.items[0].selected.offer.storeBrand).not.toBe(true);
  });

  it("strict brand flexibility adds review warnings for store-brand selections", () => {
    const needs = generateGroceryNeeds("milk, sandwich bread", "manual_list", {
      ...preferences,
      brandFlexibility: "strict",
    });
    const cart = buildOptimizedCart(needs, {
      ...preferences,
      brandFlexibility: "strict",
      optimizationGoal: "cheapest",
    });

    expect(cart.warnings.some((warning) => warning.includes("strict brand flexibility"))).toBe(true);
  });

  it("exposes deterministic score breakdowns for plan measurement", () => {
    const needs = generateGroceryNeeds("milk, eggs, bananas", "manual_list", {
      ...preferences,
      organicPreference: "prefer",
    });
    const firstCart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "best_value",
      organicPreference: "prefer",
      maxStores: 3,
    });
    const secondCart = buildOptimizedCart(needs, {
      ...preferences,
      optimizationGoal: "best_value",
      organicPreference: "prefer",
      maxStores: 3,
    });

    expect(firstCart.scoreBreakdown.weightedScore).toBeGreaterThan(0);
    expect(firstCart.scoreBreakdown.weightedScore).toBeLessThanOrEqual(100);
    expect(firstCart.scoreBreakdown).toEqual(secondCart.scoreBreakdown);
    expect(firstCart.items.map((item) => item.selected.offer.id)).toEqual(
      secondCart.items.map((item) => item.selected.offer.id),
    );
  });

  it("handles the full preference matrix with invariant checks", () => {
    const optimizationGoals: OptimizationGoal[] = ["cheapest", "best_value", "fewest_stores", "preferred_brands"];
    const organicPreferences: Array<UserPreferences["organicPreference"]> = ["none", "prefer", "prefer_non_organic", "required"];
    const brandFlexibilities: Array<UserPreferences["brandFlexibility"]> = ["flexible", "balanced", "strict"];
    const fulfillmentModes: Array<UserPreferences["fulfillmentMode"]> = ["pickup", "delivery"];
    const maxStoreOptions = [1, 2, 3];
    const budgetTargets = [0, 55, 8, 1];
    const failures: string[] = [];

    for (const optimizationGoal of optimizationGoals) {
      for (const organicPreference of organicPreferences) {
        for (const brandFlexibility of brandFlexibilities) {
          for (const fulfillmentMode of fulfillmentModes) {
            for (const maxStores of maxStoreOptions) {
              for (const budgetTarget of budgetTargets) {
                const matrixPreferences = {
                  ...preferences,
                  optimizationGoal,
                  organicPreference,
                  brandFlexibility,
                  fulfillmentMode,
                  maxStores,
                  budgetTarget,
                };
                const needs = generateGroceryNeeds("milk, eggs, bananas", "manual_list", matrixPreferences);
                const cart = buildOptimizedCart(needs, matrixPreferences);
                const repeatedCart = buildOptimizedCart(needs, matrixPreferences);
                const label = `${optimizationGoal}/${organicPreference}/${brandFlexibility}/${fulfillmentMode}/max${maxStores}/budget${budgetTarget}`;

                if (cart.items.length !== needs.length) {
                  failures.push(`${label}: expected ${needs.length} items, got ${cart.items.length}`);
                }

                if (cart.status !== "ready") {
                  failures.push(`${label}: expected ready status, got ${cart.status}`);
                }

                if (cart.stores.length > maxStores) {
                  failures.push(`${label}: selected ${cart.stores.length} stores over max ${maxStores}`);
                }

                if (cart.total < cart.subtotal || cart.total < 0 || cart.subtotal < 0 || cart.fees < 0) {
                  failures.push(`${label}: invalid totals subtotal=${cart.subtotal} fees=${cart.fees} total=${cart.total}`);
                }

                if (fulfillmentMode === "delivery" && cart.stores.length > 0 && cart.fees <= 0) {
                  failures.push(`${label}: delivery cart should include fees`);
                }

                if (fulfillmentMode === "pickup" && cart.fees !== 0) {
                  failures.push(`${label}: pickup cart should not include fees in the mock catalog`);
                }

                if (organicPreference === "required" && cart.items.some((item) => !item.selected.offer.organic)) {
                  failures.push(`${label}: non-organic item selected when organic is required`);
                }

                if (optimizationGoal === "fewest_stores" && maxStores > 1 && cart.stores.length !== 1) {
                  failures.push(`${label}: fewest stores should choose one store when the fixture supports it`);
                }

                if (budgetTarget > 0 && cart.total > budgetTarget && !cart.warnings.some((warning) => warning.includes("over the budget target"))) {
                  failures.push(`${label}: missing over-budget warning`);
                }

                if (cart.explanations.length === 0) {
                  failures.push(`${label}: missing explanations`);
                }

                if (cart.total !== repeatedCart.total || cart.status !== repeatedCart.status) {
                  failures.push(`${label}: result is not deterministic`);
                }
              }
            }
          }
        }
      }
    }

    expect(failures).toEqual([]);
  }, 15_000);
});
