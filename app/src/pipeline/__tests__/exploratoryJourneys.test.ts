import { describe, expect, it } from "vitest";
import type { GroceryNeedSource, UserPreferences } from "@/domain/grocery";
import { generateGroceryInference } from "@/pipeline/needs";
import { buildOptimizedCart } from "@/pipeline/optimizer";
import { searchCatalogProducts } from "@/pipeline/productMatcher";

type JourneyMode = "meal" | "list" | "add_item";

type JourneyCase = {
  id: string;
  title: string;
  mode: JourneyMode;
  input: string;
  preferences?: Partial<UserPreferences>;
  minNeeds?: number;
  expectedNeeds?: string[];
  expectedSearchResults?: string[];
  expectUncertain?: boolean;
  expectUnmatchedCart?: boolean;
  expectBudgetWarning?: boolean;
  expectPlanIds?: string[];
};

const basePreferences: UserPreferences = {
  optimizationGoal: "cheapest",
  maxStores: 2,
  fulfillmentMode: "pickup",
  organicPreference: "none",
  brandFlexibility: "flexible",
  budgetTarget: 55,
};

const journeyCases: JourneyCase[] = [
  meal("J001", "brief shawarma discovery", "shawarma", 8, ["lamb", "pita bread", "shawarma seasoning"]),
  meal("J002", "lamb shawarma plate", "lamb shawarma plate", 8, ["lamb", "pita bread", "white rice"]),
  meal("J003", "chicken shawarma plate", "chicken shawarma plate", 8, ["chicken thighs", "pita bread"]),
  meal("J004", "typo shawarma", "shwarma", 8, ["lamb", "pita bread"]),
  meal("J005", "shawarma rice bowl", "shawarma rice bowl", 8, ["white rice", "shawarma seasoning"]),
  meal("J006", "pita shawarma", "pita shawarma", 8, ["pita bread"]),
  meal("J007", "middle eastern lamb plate", "middle eastern lamb plate", 8, ["lamb"]),
  meal("J008", "cobb salad", "cobb salad", 8, ["romaine lettuce", "bacon"]),
  meal("J009", "chicken cobb salad", "chicken cobb salad", 8, ["chicken breast", "romaine lettuce"]),
  meal("J010", "cobb salad with rice", "cobb salad with chicken and rice", 9, ["white rice", "chicken breast"]),
  meal("J011", "tacos", "tacos", 5, ["ground beef", "tortillas"]),
  meal("J012", "ground beef tacos", "ground beef tacos", 5, ["ground beef", "salsa"]),
  meal("J013", "taco night", "taco night", 5, ["tortillas", "shredded cheese"]),
  meal("J014", "pasta dinner", "pasta dinner", 3, ["pasta", "marinara sauce"]),
  meal("J015", "spaghetti dinner", "spaghetti dinner", 3, ["pasta", "parmesan cheese"]),
  meal("J016", "pasta night", "pasta night", 3, ["pasta"]),
  meal("J017", "curry", "curry", 5, ["curry paste", "coconut milk"]),
  meal("J018", "chicken curry", "chicken curry", 5, ["chicken thighs", "white rice"]),
  meal("J019", "thai curry", "thai curry", 5, ["coconut milk", "curry paste"]),
  meal("J020", "stir fry", "stir fry", 5, ["bell peppers", "garlic"]),
  meal("J021", "chicken stir fry", "chicken stir fry", 5, ["chicken thighs", "white rice"]),
  meal("J022", "rice stir fry", "rice stir fry", 5, ["white rice", "bell peppers"]),
  list("J023", "staple list", "milk, bread, bananas", 3, ["milk", "sandwich bread", "bananas"]),
  list("J024", "staples with oat milk", "milk, sandwich bread, bananas, oat milk", 4, ["oat milk"]),
  list("J025", "peanut butter toast list", "peanut butter, bread, bananas", 3, ["peanut butter"]),
  list("J026", "breakfast add-ons", "eggs, bacon, avocado", 3, ["eggs", "bacon", "avocado"]),
  list("J027", "salad short list", "romaine, tomatoes, ranch", 3, ["romaine lettuce", "tomatoes", "ranch dressing"]),
  list("J028", "dressing and cheese", "blue cheese, ranch dressing", 2, ["blue cheese", "ranch dressing"]),
  list("J029", "oatmilk alias", "oatmilk, bananas", 2, ["oat milk", "bananas"]),
  list("J030", "typo list", "bananna, bred, milk", 3, ["bananas", "sandwich bread", "milk"]),
  list("J031", "newline list", "milk\neggs\nbread", 3, ["milk", "eggs", "sandwich bread"]),
  list("J032", "shawarma adjacent list", "flatbread, yogurt, cucumber", 3, ["pita bread", "plain yogurt", "cucumber"]),
  list("J033", "curry staples", "curry paste, coconut milk, rice", 3, ["curry paste", "coconut milk", "white rice"]),
  list("J034", "pasta staples", "pasta, marinara, parmesan", 3, ["pasta", "marinara sauce", "parmesan cheese"]),
  list("J035", "taco staples", "tortillas, salsa, cheddar", 3, ["tortillas", "salsa", "shredded cheese"]),
  list("J036", "stir fry staples", "chicken thighs, peppers, garlic", 3, ["chicken thighs", "bell peppers", "garlic"]),
  addItem("J037", "flatbread add search", "flatbread", ["pita bread"]),
  addItem("J038", "greek yogurt add search", "greek yogurt", ["plain yogurt"]),
  addItem("J039", "protein add search", "protein", ["chicken breast"]),
  addItem("J040", "romaine add search", "romaine", ["romaine lettuce"]),
  addItem("J041", "lettuce add search", "lettuce", ["romaine lettuce"]),
  addItem("J042", "egg add search", "egg", ["eggs"]),
  addItem("J043", "cheddar add search", "cheddar", ["shredded cheese"]),
  addItem("J044", "pasta sauce add search", "pasta sauce", ["marinara sauce"]),
  addItem("J045", "curry add search", "curry", ["curry paste"]),
  addItem("J046", "shawarma spice add search", "shawarma spice", ["shawarma seasoning"]),
  addItem("J047", "dairy-free add search", "dairy-free", ["oat milk", "coconut milk"]),
  addItem("J048", "empty add search", "", ["chicken breast"]),
  list("J049", "duplicate romaine can become quantity edit", "romaine, romaine", 1, ["romaine lettuce"]),
  meal("J050", "shawarma supports quantity edits", "shawarma", 8, ["lamb"]),
  list("J051", "single item can be removed by edit flow", "milk", 1, ["milk"]),
  meal("J052", "Cobb can accept extra milk", "cobb salad", 8, ["romaine lettuce"]),
  list("J053", "moon milk add should not match", "moon milk", 0, [], { expectUncertain: true }),
  meal("J054", "Cobb alternatives are available", "cobb salad", 8, ["romaine lettuce"], { expectPlanIds: ["recommended", "best-value"] }),
  meal("J055", "Cobb removal base cart exists", "cobb salad", 8, ["eggs"]),
  meal("J056", "built cart can become stale when prompt changes", "cobb salad", 8, ["bacon"]),
  meal("J057", "meal mode can preserve meal cart", "cobb salad", 8, ["blue cheese"]),
  list("J058", "list mode can preserve list cart", "milk, bread", 2, ["milk", "sandwich bread"]),
  meal("J059", "refreshable shawarma cart", "shawarma", 8, ["shawarma seasoning"]),
  list("J060", "selected plan can persist as cart data", "eggs", 1, ["eggs"], { preferences: { organicPreference: "prefer" }, expectPlanIds: ["recommended", "best-value"] }),
  list("J061", "cheapest staples", "milk, eggs, bananas", 3, ["milk"], { preferences: { optimizationGoal: "cheapest" } }),
  list("J062", "best value organic staples", "milk, eggs, bananas", 3, ["eggs"], { preferences: { optimizationGoal: "best_value", organicPreference: "prefer", maxStores: 3 } }),
  list("J063", "fewest stores staples", "milk, bread, bananas", 3, ["bananas"], { preferences: { optimizationGoal: "fewest_stores", maxStores: 3 } }),
  list("J064", "preferred brands blue cheese", "blue cheese", 1, ["blue cheese"], { preferences: { optimizationGoal: "preferred_brands", brandFlexibility: "strict" } }),
  meal("J065", "max stores one Cobb", "cobb salad with chicken and rice", 9, ["white rice"], { preferences: { maxStores: 1 } }),
  list("J066", "max stores two staples", "milk, bread, bananas", 3, ["milk"], { preferences: { maxStores: 2 } }),
  list("J067", "delivery fees staples", "milk, bread", 2, ["milk"], { preferences: { fulfillmentMode: "delivery" } }),
  list("J068", "pickup fees staples", "milk, bread", 2, ["sandwich bread"], { preferences: { fulfillmentMode: "pickup" } }),
  list("J069", "organic required staples", "milk, eggs, bananas", 3, ["milk"], { preferences: { organicPreference: "required", maxStores: 3 } }),
  list("J070", "organic required unsupported seasoning", "shawarma seasoning", 1, ["shawarma seasoning"], { preferences: { organicPreference: "required" }, expectUnmatchedCart: true }),
  list("J071", "organic preferred eggs", "eggs", 1, ["eggs"], { preferences: { optimizationGoal: "best_value", organicPreference: "prefer" } }),
  list("J072", "non organic preferred eggs", "eggs", 1, ["eggs"], { preferences: { optimizationGoal: "best_value", organicPreference: "prefer_non_organic" } }),
  list("J073", "no organic preference eggs", "eggs", 1, ["eggs"], { preferences: { organicPreference: "none" } }),
  list("J074", "strict brands staples", "milk, bread", 2, ["milk"], { preferences: { brandFlexibility: "strict" } }),
  list("J075", "flexible brands staples", "milk, bread", 2, ["milk"], { preferences: { brandFlexibility: "flexible" } }),
  list("J076", "balanced brands staples", "milk, bread", 2, ["milk"], { preferences: { brandFlexibility: "balanced" } }),
  list("J077", "tight budget eggs", "eggs", 1, ["eggs"], { preferences: { optimizationGoal: "best_value", organicPreference: "prefer", budgetTarget: 2 }, expectBudgetWarning: true }),
  list("J078", "roomy budget eggs", "eggs", 1, ["eggs"], { preferences: { optimizationGoal: "best_value", organicPreference: "prefer", budgetTarget: 20 } }),
  list("J079", "zero budget target", "eggs", 1, ["eggs"], { preferences: { budgetTarget: 0 } }),
  list("J080", "compare recommended versus best value", "eggs", 1, ["eggs"], { preferences: { organicPreference: "prefer" }, expectPlanIds: ["recommended", "best-value"] }),
  list("J081", "choose best value plan candidate", "eggs", 1, ["eggs"], { preferences: { organicPreference: "prefer" }, expectPlanIds: ["best-value"] }),
  list("J082", "choose cheapest one store candidate", "milk, bread, bananas", 3, ["milk"], { expectPlanIds: ["cheapest-one-store"] }),
  list("J083", "choose fewest stores candidate", "milk, bread, bananas", 3, ["milk"], { preferences: { maxStores: 3 }, expectPlanIds: ["fewest-stores"] }),
  list("J084", "choose preferred brands candidate", "blue cheese", 1, ["blue cheese"], { expectPlanIds: ["preferred-brands"] }),
  list("J085", "compare split versus one-store", "milk, bread, bananas", 3, ["milk"], { preferences: { maxStores: 3 }, expectPlanIds: ["recommended", "cheapest-one-store"] }),
  meal("J086", "unsupported saturn meal", "surprise feast from saturn", 0, [], { expectUncertain: true }),
  list("J087", "unsupported moon milk list", "moon milk", 0, [], { expectUncertain: true }),
  meal("J088", "vague healthy lunches", "healthy lunches", 0, [], { expectUncertain: true }),
  meal("J089", "ambiguous sauce", "sauce", 0, [], { expectUncertain: true }),
  meal("J090", "single chicken meal", "chicken", 0, [], { expectUncertain: true }),
  list("J091", "rice list", "rice", 1, ["white rice"]),
  meal("J092", "rice meal idea", "rice", 0, [], { expectUncertain: true }),
  meal("J093", "cheap shawarma", "cheap shawarma", 8, ["lamb"]),
  meal("J094", "best value tacos", "best value tacos", 5, ["ground beef"]),
  meal("J095", "punctuated pasta", "pasta!!! dinner??", 3, ["pasta"]),
  meal("J096", "uppercase curry", "CHICKEN CURRY", 5, ["curry paste"]),
  meal("J097", "whitespace stir fry", "   stir   fry   ", 5, ["bell peppers"]),
  list("J098", "duplicate eggs", "eggs, eggs", 1, ["eggs"]),
  list("J099", "partial unknown list", "milk, unknown asteroid fruit", 1, ["milk"]),
  list("J100", "duplicate bread", "bread, bread, bread", 1, ["sandwich bread"]),
  list("J101", "list plus add-item exploration base", "milk, bread", 2, ["milk"], { expectPlanIds: ["recommended"] }),
  list("J102", "organic change after build", "milk, eggs, bananas", 3, ["eggs"], { preferences: { organicPreference: "prefer", optimizationGoal: "best_value" } }),
  list("J103", "fulfillment after plan comparison", "milk, bread", 2, ["sandwich bread"], { preferences: { fulfillmentMode: "delivery" } }),
  list("J104", "brand change after comparison", "blue cheese", 1, ["blue cheese"], { preferences: { brandFlexibility: "strict", optimizationGoal: "preferred_brands" } }),
  list("J105", "budget change after comparison", "eggs", 1, ["eggs"], { preferences: { budgetTarget: 2 }, expectBudgetWarning: true }),
  list("J106", "add after best-value base", "eggs", 1, ["eggs"], { preferences: { optimizationGoal: "best_value", organicPreference: "prefer" } }),
  list("J107", "alternative switch base", "eggs", 1, ["eggs"], { expectPlanIds: ["recommended", "best-value"] }),
  meal("J108", "remove after selected plan base", "cobb salad", 8, ["bacon"], { expectPlanIds: ["recommended"] }),
  list("J109", "delivery strict organic", "milk, eggs, bananas", 3, ["milk"], { preferences: { fulfillmentMode: "delivery", brandFlexibility: "strict", organicPreference: "required", maxStores: 3 } }),
  list("J110", "cheapest non-organic tight budget", "eggs", 1, ["eggs"], { preferences: { optimizationGoal: "cheapest", organicPreference: "prefer_non_organic", budgetTarget: 2 }, expectBudgetWarning: true }),
];

describe("exploratory shopper journey catalog", () => {
  it("covers at least 100 distinct journeys", () => {
    expect(journeyCases).toHaveLength(110);
    expect(new Set(journeyCases.map((journey) => journey.id)).size).toBe(journeyCases.length);
  });

  it.each(journeyCases)("$id $title", async (journey) => {
    const preferences = {
      ...basePreferences,
      ...journey.preferences,
    };

    if (journey.mode === "add_item") {
      const results = searchCatalogProducts(journey.input).map((product) => product.canonicalName);

      for (const expectedResult of journey.expectedSearchResults ?? []) {
        expect(results).toContain(expectedResult);
      }

      return;
    }

    const source: GroceryNeedSource = journey.mode === "meal" ? "recipe" : "manual_list";
    const inference = await generateGroceryInference(journey.input, source, preferences);

    if (journey.expectUncertain) {
      expect(inference.needs).toHaveLength(0);
      expect(inference.warnings.length > 0 || Boolean(inference.clarifyingQuestion)).toBe(true);
      return;
    }

    expect(inference.needs.length).toBeGreaterThanOrEqual(journey.minNeeds ?? 1);

    const canonicalNeeds = inference.needs.map((need) => need.canonicalName);

    for (const expectedNeed of journey.expectedNeeds ?? []) {
      expect(canonicalNeeds).toContain(expectedNeed);
    }

    const cart = buildOptimizedCart(inference.needs, preferences);

    if (journey.expectUnmatchedCart) {
      expect(cart.items.length).toBeLessThan(inference.needs.length);
      expect(cart.warnings.some((warning) => warning.includes("No available product matched"))).toBe(true);
      return;
    }

    expect(cart.items).toHaveLength(inference.needs.length);
    expect(cart.total).toBeGreaterThanOrEqual(cart.subtotal);
    expect(cart.stores.length).toBeLessThanOrEqual(preferences.maxStores);
    expect(cart.explanations.length).toBeGreaterThan(0);
    expect(cart.planOptions.length).toBeGreaterThan(0);

    if (preferences.fulfillmentMode === "delivery") {
      expect(cart.fees).toBeGreaterThan(0);
    }

    if (preferences.organicPreference === "required") {
      expect(cart.items.every((item) => item.selected.offer.organic)).toBe(true);
    }

    if (journey.expectBudgetWarning) {
      expect(cart.warnings.some((warning) => warning.includes("over the budget target"))).toBe(true);
    }

    for (const planId of journey.expectPlanIds ?? []) {
      expect(cart.planOptions.map((plan) => plan.id)).toContain(planId);
    }
  });
});

function meal(
  id: string,
  title: string,
  input: string,
  minNeeds: number,
  expectedNeeds: string[],
  options: Partial<JourneyCase> = {},
): JourneyCase {
  return {
    id,
    title,
    mode: "meal",
    input,
    minNeeds,
    expectedNeeds,
    ...options,
  };
}

function list(
  id: string,
  title: string,
  input: string,
  minNeeds: number,
  expectedNeeds: string[],
  options: Partial<JourneyCase> = {},
): JourneyCase {
  return {
    id,
    title,
    mode: "list",
    input,
    minNeeds,
    expectedNeeds,
    ...options,
  };
}

function addItem(
  id: string,
  title: string,
  input: string,
  expectedSearchResults: string[],
): JourneyCase {
  return {
    id,
    title,
    mode: "add_item",
    input,
    expectedSearchResults,
  };
}
