import { describe, expect, it } from "vitest";
import type { UserPreferences } from "@/domain/grocery";
import { buildOptimizedCart } from "@/pipeline/optimizer";
import { generateGroceryInference } from "@/pipeline/needs";
import { catalogProductMatcher, searchCatalogProducts } from "@/pipeline/productMatcher";
import { interpretGroceryIntentSync } from "@/pipeline/groceryIntent";

type ConstraintCase = {
  id: string;
  surface: "meal" | "list" | "add_item";
  input: string;
  expectedCore?: string;
  expectedNeeds?: string[];
  absentNeeds?: string[];
  expectedTopProduct?: string;
  expectedTopProductOneOf?: string[];
  expectedDietaryTags?: string[];
  expectedOrganic?: boolean;
  expectedPriceIntent?: "cheap" | "best_value";
  expectedFulfillmentHint?: "pickup" | "delivery";
  expectCartOrganic?: boolean;
  expectUncertain?: boolean;
};

const preferences: UserPreferences = {
  optimizationGoal: "cheapest",
  maxStores: 2,
  fulfillmentMode: "pickup",
  organicPreference: "none",
  brandFlexibility: "flexible",
  budgetTarget: 55,
};

const constraintCases: ConstraintCase[] = [
  meal("C001", "dairy free pasta dinner", { expectedCore: "pasta dinner", expectedNeeds: ["pasta", "marinara sauce"], absentNeeds: ["parmesan cheese"] }),
  meal("C002", "dairy-free pasta night", { expectedCore: "pasta night", expectedNeeds: ["pasta"], absentNeeds: ["parmesan cheese"] }),
  meal("C003", "dairy free shawarma", { expectedCore: "shawarma", expectedNeeds: ["lamb", "pita bread"], absentNeeds: ["plain yogurt"] }),
  meal("C004", "dairy free chicken shawarma plate", { expectedCore: "chicken shawarma plate", expectedNeeds: ["chicken thighs", "pita bread"], absentNeeds: ["plain yogurt", "lamb"] }),
  meal("C005", "dairy free cobb salad", { expectedCore: "cobb salad", expectedNeeds: ["romaine lettuce", "eggs"], absentNeeds: ["blue cheese"] }),
  meal("C006", "cheap tacos", { expectedCore: "tacos", expectedNeeds: ["ground beef", "tortillas"] }),
  meal("C007", "best value pasta dinner", { expectedCore: "pasta dinner", expectedNeeds: ["pasta", "marinara sauce"] }),
  meal("C008", "under $20 tacos", { expectedCore: "tacos", expectedNeeds: ["ground beef", "tortillas"] }),
  meal("C009", "organic cobb salad", { expectedCore: "cobb salad", expectedNeeds: ["romaine lettuce"], expectedOrganic: true }),
  meal("C010", "organic tacos", { expectedCore: "tacos", expectedNeeds: ["ground beef"], expectedOrganic: true }),
  meal("C011", "non organic curry", { expectedCore: "curry", expectedNeeds: ["chicken thighs", "coconut milk"], expectedOrganic: false }),
  meal("C012", "non organic eggs cobb salad", { expectedCore: "eggs cobb salad", expectedNeeds: ["eggs", "romaine lettuce"], expectedOrganic: false }),
  meal("C013", "pickup shawarma", { expectedCore: "shawarma", expectedNeeds: ["lamb", "pita bread"] }),
  meal("C014", "delivery pasta dinner", { expectedCore: "pasta dinner", expectedNeeds: ["pasta"] }),
  meal("C015", "gluten free pasta dinner", { expectedCore: "pasta dinner", expectedNeeds: ["pasta"], expectedDietaryTags: ["gluten-free"] }),
  meal("C016", "budget curry", { expectedCore: "curry", expectedNeeds: ["curry paste", "white rice"] }),
  meal("C017", "best value chicken curry", { expectedCore: "chicken curry", expectedNeeds: ["chicken thighs", "coconut milk"] }),
  meal("C018", "cheap stir fry", { expectedCore: "stir fry", expectedNeeds: ["bell peppers", "garlic"] }),
  meal("C019", "organic chicken shawarma", { expectedCore: "chicken shawarma", expectedNeeds: ["chicken thighs"], expectedOrganic: true }),
  meal("C020", "cheap dinner", { expectedCore: "dinner", expectUncertain: true }),

  list("C021", "dairy free milk", { expectedCore: "milk", expectedNeeds: ["oat milk"], expectedDietaryTags: ["dairy-free"] }),
  list("C022", "dairy-free milk", { expectedCore: "milk", expectedNeeds: ["oat milk"], expectedDietaryTags: ["dairy-free"] }),
  list("C023", "dairy free oatmilk", { expectedCore: "oatmilk", expectedNeeds: ["oat milk"], expectedDietaryTags: ["dairy-free"] }),
  list("C024", "dairy free coconut milk", { expectedCore: "coconut milk", expectedNeeds: ["coconut milk"], expectedDietaryTags: ["dairy-free"] }),
  list("C025", "organic eggs", { expectedCore: "eggs", expectedNeeds: ["eggs"], expectedOrganic: true, expectCartOrganic: true }),
  list("C026", "non organic eggs", { expectedCore: "eggs", expectedNeeds: ["eggs"], expectedOrganic: false }),
  list("C027", "organic milk", { expectedCore: "milk", expectedNeeds: ["milk"], expectedOrganic: true, expectCartOrganic: true }),
  list("C028", "non organic milk", { expectedCore: "milk", expectedNeeds: ["milk"], expectedOrganic: false }),
  list("C029", "organic romaine", { expectedCore: "romaine", expectedNeeds: ["romaine lettuce"], expectedOrganic: true, expectCartOrganic: true }),
  list("C030", "non organic avocado", { expectedCore: "avocado", expectedNeeds: ["avocado"], expectedOrganic: false }),
  list("C031", "cheap rice", { expectedCore: "rice", expectedNeeds: ["white rice"] }),
  list("C032", "best value milk", { expectedCore: "milk", expectedNeeds: ["milk"] }),
  list("C033", "under $10 bananas", { expectedCore: "bananas", expectedNeeds: ["bananas"] }),
  list("C034", "pickup bread", { expectedCore: "bread", expectedNeeds: ["sandwich bread"] }),
  list("C035", "delivery eggs", { expectedCore: "eggs", expectedNeeds: ["eggs"] }),
  list("C036", "organic tomatoes", { expectedCore: "tomatoes", expectedNeeds: ["tomatoes"], expectedOrganic: true, expectCartOrganic: true }),
  list("C037", "non organic tomatoes", { expectedCore: "tomatoes", expectedNeeds: ["tomatoes"], expectedOrganic: false }),
  list("C038", "dairy free milk, organic eggs", { expectedNeeds: ["oat milk", "eggs"], expectedDietaryTags: ["dairy-free"] }),
  list("C039", "cheap milk, non organic eggs", { expectedNeeds: ["milk", "eggs"] }),
  list("C040", "dairy free moon milk", { expectedCore: "moon milk", expectUncertain: true }),

  addItem("C041", "dairy free milk", { expectedCore: "milk", expectedTopProductOneOf: ["oat milk", "coconut milk"] }),
  addItem("C042", "dairy-free milk", { expectedCore: "milk", expectedTopProductOneOf: ["oat milk", "coconut milk"] }),
  addItem("C043", "dairy free coconut milk", { expectedCore: "coconut milk", expectedTopProduct: "coconut milk" }),
  addItem("C044", "organic eggs", { expectedCore: "eggs", expectedTopProduct: "eggs" }),
  addItem("C045", "non organic eggs", { expectedCore: "eggs", expectedTopProduct: "eggs" }),
  addItem("C046", "organic avocado", { expectedCore: "avocado", expectedTopProduct: "avocado" }),
  addItem("C047", "non organic avocado", { expectedCore: "avocado", expectedTopProduct: "avocado" }),
  addItem("C048", "cheap bread", { expectedCore: "bread", expectedTopProduct: "sandwich bread" }),
  addItem("C049", "best value rice", { expectedCore: "rice", expectedTopProduct: "white rice" }),
  addItem("C050", "under $5 bananas", { expectedCore: "bananas", expectedTopProduct: "bananas" }),
  addItem("C051", "pickup lettuce", { expectedCore: "lettuce", expectedTopProduct: "romaine lettuce" }),
  addItem("C052", "delivery shawarma spice", { expectedCore: "shawarma spice", expectedTopProduct: "shawarma seasoning" }),
  addItem("C053", "gluten free pasta", { expectedCore: "pasta", expectedTopProduct: "pasta" }),
  addItem("C054", "organic moon milk", { expectedCore: "moon milk", expectUncertain: true }),
  meal("C055", "dary free pasta dinner", { expectedCore: "pasta dinner", expectedNeeds: ["pasta", "marinara sauce"], absentNeeds: ["parmesan cheese"], expectedDietaryTags: ["dairy-free"] }),
  meal("C056", "darie free shawarma", { expectedCore: "shawarma", expectedNeeds: ["lamb", "pita bread"], absentNeeds: ["plain yogurt"], expectedDietaryTags: ["dairy-free"] }),
  meal("C057", "lactose free cobb salad", { expectedCore: "cobb salad", expectedNeeds: ["romaine lettuce", "eggs"], absentNeeds: ["blue cheese"], expectedDietaryTags: ["dairy-free"] }),
  meal("C058", "no dairy chicken shawarma", { expectedCore: "chicken shawarma", expectedNeeds: ["chicken thighs", "pita bread"], absentNeeds: ["plain yogurt", "lamb"], expectedDietaryTags: ["dairy-free"] }),
  meal("C059", "orgnic tacos", { expectedCore: "tacos", expectedNeeds: ["ground beef", "tortillas"], expectedOrganic: true }),
  meal("C060", "non orgnic curry", { expectedCore: "curry", expectedNeeds: ["chicken thighs", "coconut milk"], expectedOrganic: false }),
  meal("C061", "cheep tacos", { expectedCore: "tacos", expectedNeeds: ["ground beef", "tortillas"] }),
  meal("C062", "low cost stir fry", { expectedCore: "stir fry", expectedNeeds: ["bell peppers", "garlic"] }),
  list("C063", "dary free milk", { expectedCore: "milk", expectedNeeds: ["oat milk"], expectedDietaryTags: ["dairy-free"] }),
  list("C064", "darie free milk", { expectedCore: "milk", expectedNeeds: ["oat milk"], expectedDietaryTags: ["dairy-free"] }),
  list("C065", "lactose free milk", { expectedCore: "milk", expectedNeeds: ["oat milk"], expectedDietaryTags: ["dairy-free"] }),
  list("C066", "no dairy milk", { expectedCore: "milk", expectedNeeds: ["oat milk"], expectedDietaryTags: ["dairy-free"] }),
  list("C067", "orgnic eggs", { expectedCore: "eggs", expectedNeeds: ["eggs"], expectedOrganic: true, expectCartOrganic: true }),
  list("C068", "non orgnic eggs", { expectedCore: "eggs", expectedNeeds: ["eggs"], expectedOrganic: false }),
  list("C069", "cheep rice", { expectedCore: "rice", expectedNeeds: ["white rice"] }),
  list("C070", "dary free moon milk", { expectedCore: "moon milk", expectUncertain: true }),
  addItem("C071", "dary free milk", { expectedCore: "milk", expectedTopProductOneOf: ["oat milk", "coconut milk"] }),
  addItem("C072", "lactose free milk", { expectedCore: "milk", expectedTopProductOneOf: ["oat milk", "coconut milk"] }),
  addItem("C073", "orgnic eggs", { expectedCore: "eggs", expectedTopProduct: "eggs" }),
  addItem("C074", "non orgnic eggs", { expectedCore: "eggs", expectedTopProduct: "eggs" }),
  addItem("C075", "dary free moon milk", { expectedCore: "moon milk", expectUncertain: true }),
  meal("C076", "dairy fre pasta dinner", { expectedCore: "pasta dinner", expectedNeeds: ["pasta", "marinara sauce"], absentNeeds: ["parmesan cheese"], expectedDietaryTags: ["dairy-free"] }),
  meal("C077", "glutn free pasta dinner", { expectedCore: "pasta dinner", expectedNeeds: ["pasta"], expectedDietaryTags: ["gluten-free"] }),
  meal("C078", "organik cobb salad", { expectedCore: "cobb salad", expectedNeeds: ["romaine lettuce"], expectedOrganic: true }),
  meal("C079", "non organik curry", { expectedCore: "curry", expectedNeeds: ["chicken thighs", "coconut milk"], expectedOrganic: false }),
  meal("C080", "budjet curry", { expectedCore: "curry", expectedNeeds: ["curry paste", "white rice"], expectedPriceIntent: "cheap" }),
  meal("C081", "best valu pasta dinner", { expectedCore: "pasta dinner", expectedNeeds: ["pasta", "marinara sauce"], expectedPriceIntent: "best_value" }),
  meal("C082", "delivry pasta dinner", { expectedCore: "pasta dinner", expectedNeeds: ["pasta"], expectedFulfillmentHint: "delivery" }),
  meal("C083", "picup shawarma", { expectedCore: "shawarma", expectedNeeds: ["lamb", "pita bread"], expectedFulfillmentHint: "pickup" }),
  meal("C084", "shwarma", { expectedCore: "shwarma", expectedNeeds: ["lamb", "pita bread"] }),
  meal("C085", "spagetti dinner", { expectedCore: "spagetti dinner", expectedNeeds: ["pasta", "marinara sauce"] }),
  list("C086", "dairy fre milk", { expectedCore: "milk", expectedNeeds: ["oat milk"], expectedDietaryTags: ["dairy-free"] }),
  list("C087", "glutn free pasta", { expectedCore: "pasta", expectedNeeds: ["pasta"], expectedDietaryTags: ["gluten-free"] }),
  list("C088", "organik eggs", { expectedCore: "eggs", expectedNeeds: ["eggs"], expectedOrganic: true, expectCartOrganic: true }),
  list("C089", "non organik eggs", { expectedCore: "eggs", expectedNeeds: ["eggs"], expectedOrganic: false }),
  list("C090", "budjet rice", { expectedCore: "rice", expectedNeeds: ["white rice"], expectedPriceIntent: "cheap" }),
  list("C091", "best valu milk", { expectedCore: "milk", expectedNeeds: ["milk"], expectedPriceIntent: "best_value" }),
  list("C092", "delivry eggs", { expectedCore: "eggs", expectedNeeds: ["eggs"], expectedFulfillmentHint: "delivery" }),
  list("C093", "picup bread", { expectedCore: "bread", expectedNeeds: ["sandwich bread"], expectedFulfillmentHint: "pickup" }),
  addItem("C094", "dairy fre milk", { expectedCore: "milk", expectedTopProductOneOf: ["oat milk", "coconut milk"], expectedDietaryTags: ["dairy-free"] }),
  addItem("C095", "glutn free pasta", { expectedCore: "pasta", expectedTopProduct: "pasta", expectedDietaryTags: ["gluten-free"] }),
  addItem("C096", "organik eggs", { expectedCore: "eggs", expectedTopProduct: "eggs", expectedOrganic: true }),
  addItem("C097", "non organik eggs", { expectedCore: "eggs", expectedTopProduct: "eggs", expectedOrganic: false }),
  addItem("C098", "budjet bread", { expectedCore: "bread", expectedTopProduct: "sandwich bread", expectedPriceIntent: "cheap" }),
  addItem("C099", "best valu rice", { expectedCore: "rice", expectedTopProduct: "white rice", expectedPriceIntent: "best_value" }),
  addItem("C100", "delivry shawarma spice", { expectedCore: "shawarma spice", expectedTopProduct: "shawarma seasoning", expectedFulfillmentHint: "delivery" }),
  addItem("C101", "picup lettuce", { expectedCore: "lettuce", expectedTopProduct: "romaine lettuce", expectedFulfillmentHint: "pickup" }),
];

describe("Phase 2.5 constraint understanding fixtures", () => {
  it("covers at least 50 new constrained user inputs across meal, list, and add-item surfaces", () => {
    expect(constraintCases.length).toBeGreaterThanOrEqual(50);
    expect(new Set(constraintCases.map((item) => item.id)).size).toBe(constraintCases.length);

    for (const surface of ["meal", "list", "add_item"]) {
      expect(constraintCases.some((item) => item.surface === surface)).toBe(true);
    }
  });

  it.each(constraintCases)("$id $surface: $input", async (constraintCase) => {
    const parsedIntent = interpretGroceryIntentSync(constraintCase.input, searchContextForSurface(constraintCase.surface));

    if (constraintCase.expectedCore) {
      expect(parsedIntent.coreQuery).toBe(constraintCase.expectedCore);
    }

    if (constraintCase.expectedDietaryTags) {
      expect(constraintCase.expectedDietaryTags.every((tag) => parsedIntent.constraints.dietaryTags.includes(tag))).toBe(true);
    }

    if (constraintCase.expectedOrganic !== undefined) {
      expect(parsedIntent.constraints.organic).toBe(constraintCase.expectedOrganic);
    }

    if (constraintCase.expectedPriceIntent) {
      expect(parsedIntent.constraints.priceIntent).toBe(constraintCase.expectedPriceIntent);
    }

    if (constraintCase.expectedFulfillmentHint) {
      expect(parsedIntent.fulfillmentHint).toBe(constraintCase.expectedFulfillmentHint);
    }

    if (constraintCase.surface === "add_item") {
      const results = searchCatalogProducts(constraintCase.input).map((product) => product.canonicalName);

      if (constraintCase.expectUncertain) {
        expect(results).toHaveLength(0);
        return;
      }

      expect(results.length).toBeGreaterThan(0);

      if (constraintCase.expectedTopProduct) {
        expect(results[0]).toBe(constraintCase.expectedTopProduct);
      }

      if (constraintCase.expectedTopProductOneOf) {
        expect(constraintCase.expectedTopProductOneOf).toContain(results[0]);
      }

      return;
    }

    const result = await generateGroceryInference(
      constraintCase.input,
      constraintCase.surface === "meal" ? "recipe" : "manual_list",
      preferences,
    );

    if (constraintCase.expectUncertain) {
      expect(result.needs).toHaveLength(0);
      expect(result.warnings.length > 0 || Boolean(result.clarifyingQuestion)).toBe(true);
      return;
    }

    const canonicalNames = result.needs.map((need) => need.canonicalName);

    for (const expectedNeed of constraintCase.expectedNeeds ?? []) {
      expect(canonicalNames).toContain(expectedNeed);
    }

    for (const absentNeed of constraintCase.absentNeeds ?? []) {
      expect(canonicalNames).not.toContain(absentNeed);
    }

    if (constraintCase.expectedDietaryTags) {
      expect(result.needs.some((need) =>
        constraintCase.expectedDietaryTags?.every((tag) => need.constraints.dietaryTags?.includes(tag)),
      )).toBe(true);
    }

    if (constraintCase.expectedOrganic !== undefined) {
      expect(result.needs.every((need) => need.constraints.organic === constraintCase.expectedOrganic)).toBe(true);
    }

    if (constraintCase.expectCartOrganic) {
      const cart = buildOptimizedCart(result.needs, preferences);

      expect(cart.items.length).toBeGreaterThan(0);
      expect(cart.items.every((item) => item.selected.offer.organic)).toBe(true);
    }

    if (constraintCase.input.includes("non organic eggs")) {
      const eggNeed = result.needs.find((need) => need.canonicalName === "eggs");

      expect(eggNeed).toBeDefined();
      expect(catalogProductMatcher.findCandidates(eggNeed!, preferences)[0].offer.organic).not.toBe(true);
    }
  });
});

function meal(
  id: string,
  input: string,
  expectations: Omit<ConstraintCase, "id" | "surface" | "input">,
): ConstraintCase {
  return { id, surface: "meal", input, ...expectations };
}

function list(
  id: string,
  input: string,
  expectations: Omit<ConstraintCase, "id" | "surface" | "input">,
): ConstraintCase {
  return { id, surface: "list", input, ...expectations };
}

function addItem(
  id: string,
  input: string,
  expectations: Omit<ConstraintCase, "id" | "surface" | "input">,
): ConstraintCase {
  return { id, surface: "add_item", input, ...expectations };
}

function searchContextForSurface(surface: ConstraintCase["surface"]) {
  if (surface === "meal") {
    return { surface: "meal_idea" as const };
  }

  if (surface === "list") {
    return { surface: "grocery_list" as const };
  }

  return { surface: "add_item" as const };
}
