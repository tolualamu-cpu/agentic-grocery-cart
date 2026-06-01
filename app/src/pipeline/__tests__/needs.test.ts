import { describe, expect, it } from "vitest";
import type { UserPreferences } from "@/domain/grocery";
import { generateGroceryInference, generateGroceryNeeds } from "@/pipeline/needs";

const preferences: UserPreferences = {
  optimizationGoal: "cheapest",
  maxStores: 2,
  fulfillmentMode: "pickup",
  organicPreference: "none",
  brandFlexibility: "flexible",
  budgetTarget: 55,
};

describe("generateGroceryNeeds", () => {
  it("turns a meal idea into recipe grocery needs", () => {
    const needs = generateGroceryNeeds("Cobb salad with chicken and rice", "recipe", preferences);

    expect(needs.map((need) => need.canonicalName)).toEqual(
      expect.arrayContaining([
        "romaine lettuce",
        "chicken breast",
        "eggs",
        "bacon",
        "avocado",
        "tomatoes",
        "blue cheese",
        "ranch dressing",
        "white rice",
      ]),
    );
  });

  it("turns a grocery list into only matched known needs", () => {
    const needs = generateGroceryNeeds("milk, sandwich bread, bananas", "manual_list", preferences);

    expect(needs.map((need) => need.canonicalName)).toEqual([
      "milk",
      "sandwich bread",
      "bananas",
    ]);
  });

  it("does not invent needs for unknown input", () => {
    const needs = generateGroceryNeeds("moon milk, dragonfruit chips", "manual_list", preferences);

    expect(needs).toHaveLength(0);
  });

  it("carries organic-required preference into generated needs", () => {
    const needs = generateGroceryNeeds("milk", "manual_list", {
      ...preferences,
      organicPreference: "required",
    });

    expect(needs[0].constraints.organic).toBe(true);
  });

  it("infers lamb shawarma plate through the mock model generator", async () => {
    const result = await generateGroceryInference("I want a lamb shawarma plate", "recipe", preferences);

    expect(result.needs.map((need) => need.canonicalName)).toEqual(
      expect.arrayContaining([
        "lamb",
        "pita bread",
        "white rice",
        "cucumber",
        "tomatoes",
        "red onion",
        "plain yogurt",
        "lemon",
        "garlic",
        "shawarma seasoning",
        "parsley",
      ]),
    );
    expect(result.warnings[0]).toContain("mock model meal profile");
  });

  it.each([
    ["shawarma", ["lamb", "pita bread", "shawarma seasoning"]],
    ["shwarma", ["lamb", "pita bread", "shawarma seasoning"]],
    ["I want shawarma for dinner", ["lamb", "pita bread", "plain yogurt"]],
    ["shawarma plate", ["lamb", "white rice", "cucumber"]],
    ["shawarma rice bowl", ["lamb", "white rice", "tomatoes"]],
    ["pita shawarma wraps", ["lamb", "pita bread", "garlic"]],
    ["middle eastern lamb plate", ["lamb", "pita bread", "parsley"]],
    ["chicken shawarma plate", ["chicken thighs", "pita bread", "shawarma seasoning"]],
    ["taco night", ["ground beef", "tortillas", "salsa"]],
    ["spaghetti dinner", ["pasta", "marinara sauce", "parmesan cheese"]],
    ["chicken curry with rice", ["chicken thighs", "coconut milk", "curry paste"]],
    ["stir fry", ["chicken thighs", "white rice", "bell peppers"]],
  ])("infers a useful cart shape for natural meal input: %s", async (input, expectedNeeds) => {
    const result = await generateGroceryInference(input, "recipe", preferences);
    const canonicalNames = result.needs.map((need) => need.canonicalName);

    expect(canonicalNames).toEqual(expect.arrayContaining(expectedNeeds));

    if (input.includes("chicken shawarma")) {
      expect(canonicalNames).not.toContain("lamb");
    }
  });

  it.each([
    ["turkey breakfast plate", ["eggs", "turkey sausage", "rolled oats", "blueberries", "oat milk"]],
    ["turkey sandwich lunch", ["sandwich bread", "deli turkey", "sliced cheese", "mustard"]],
    ["tuna salad sandwich", ["tuna", "sandwich bread", "mayonnaise", "pickles"]],
    ["salmon rice dinner", ["salmon", "white rice", "broccoli", "lemon"]],
    ["shrimp stir fry", ["shrimp", "white rice", "bell peppers", "soy sauce"]],
    ["tofu veggie stir fry", ["tofu", "white rice", "broccoli", "soy sauce"]],
    ["hummus snack plate", ["hummus", "pita bread", "cucumber", "baby carrots", "crackers"]],
    ["kids lunch box", ["string cheese", "apples", "crackers", "granola bars"]],
    ["oatmeal breakfast", ["rolled oats", "blueberries", "strawberries", "bananas", "peanut butter"]],
    ["black bean taco bowl", ["black beans", "white rice", "salsa", "avocado"]],
  ])("infers expanded catalog-backed meal profile: %s", async (input, expectedNeeds) => {
    const result = await generateGroceryInference(input, "recipe", preferences);

    expect(result.needs.map((need) => need.canonicalName)).toEqual(expect.arrayContaining(expectedNeeds));
  });

  it("composes multiple meal profiles from one meal idea", async () => {
    const result = await generateGroceryInference("chicken curry and shawarma", "recipe", preferences);

    expect(result.needs.map((need) => need.canonicalName)).toEqual(
      expect.arrayContaining([
        "chicken thighs",
        "coconut milk",
        "curry paste",
        "lamb",
        "pita bread",
        "shawarma seasoning",
      ]),
    );
    expect(result.warnings[0]).toContain("meal profiles");
  });

  it("composes a meal profile plus an item shorthand without changing need labels", async () => {
    const result = await generateGroceryInference("salmon dinner, turkey", "recipe", preferences);

    expect(result.needs.map((need) => need.canonicalName)).toEqual(
      expect.arrayContaining(["salmon", "white rice", "broccoli", "deli turkey"]),
    );
    expect(result.needs.map((need) => need.displayName)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("used by")]),
    );
  });

  it("deduplicates shared ingredients and rolls up quantity for composed meals", async () => {
    const result = await generateGroceryInference("shrimp stir fry and tofu veggie stir fry", "recipe", preferences);
    const canonicalNames = result.needs.map((need) => need.canonicalName);
    const riceNeed = result.needs.find((need) => need.canonicalName === "white rice");

    expect(canonicalNames).toEqual(expect.arrayContaining(["shrimp", "tofu", "white rice", "soy sauce"]));
    expect(canonicalNames.filter((canonicalName) => canonicalName === "white rice")).toHaveLength(1);
    expect(riceNeed?.quantity).toBe(2);
    expect(riceNeed?.displayName).toBe("White rice");
  });

  it("keeps single broad meal profile behavior unchanged", async () => {
    const result = await generateGroceryInference("stir fry", "recipe", preferences);
    const canonicalNames = result.needs.map((need) => need.canonicalName);

    expect(canonicalNames).toEqual(expect.arrayContaining(["chicken thighs", "white rice", "bell peppers"]));
    expect(canonicalNames).not.toContain("shrimp");
    expect(canonicalNames).not.toContain("tofu");
  });

  it("uses typo-tolerant matching for manual grocery list items", () => {
    const needs = generateGroceryNeeds("romain letuce, avacado, bananna", "manual_list", preferences);

    expect(needs.map((need) => need.canonicalName)).toEqual(
      expect.arrayContaining(["romaine lettuce", "avocado", "bananas"]),
    );
  });

  it("returns uncertainty instead of fake needs for unsupported meals", async () => {
    const result = await generateGroceryInference("surprise feast from saturn", "recipe", preferences);

    expect(result.needs).toHaveLength(0);
    expect(result.clarifyingQuestion).toContain("could not confidently infer");
    expect(result.warnings[0]).toContain("No mock model meal profile matched");
  });

  it.each([
    "chicken",
    "healthy lunch",
    "dinner for four",
    "cheap dinner",
  ])("asks for clarification instead of inventing needs for ambiguous meal input: %s", async (input) => {
    const result = await generateGroceryInference(input, "recipe", preferences);

    expect(result.needs).toHaveLength(0);
    expect(result.clarifyingQuestion).toBe("What meal or grocery list should I build from that?");
    expect(result.warnings[0]).toContain("more specific meal");
  });
});
