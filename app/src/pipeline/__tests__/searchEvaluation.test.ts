import { describe, expect, it } from "vitest";
import { mealProfiles } from "@/data/mealProfiles";
import { products } from "@/data/mockCatalog";
import { knownNeeds } from "@/pipeline/needs";
import {
  deterministicSearchService,
  type SearchDocument,
  type SearchIntent,
  type SearchSurface,
} from "@/pipeline/search";

type SearchEvaluationCase = {
  id: string;
  category: "meal" | "typo" | "alias" | "ambiguous" | "add_item" | "constraint" | "semantic" | "unsupported";
  input: string;
  surface: SearchSurface;
  expectedIntent?: SearchIntent;
  expectedTopId?: string;
  expectedTopOneOf?: string[];
  expectedIds?: string[];
  expectEmpty?: boolean;
  expectWarning?: boolean;
};

const evaluationCases: SearchEvaluationCase[] = [
  fixture("S001", "meal", "shawarma", "meal_idea", { expectedIntent: "meal", expectedTopId: "meal:shawarma" }),
  fixture("S002", "meal", "lamb shawarma plate", "meal_idea", { expectedTopId: "meal:shawarma" }),
  fixture("S003", "meal", "I want shawarma for dinner", "meal_idea", { expectedTopId: "meal:shawarma" }),
  fixture("S004", "meal", "shawarma rice bowl", "meal_idea", { expectedTopId: "meal:shawarma" }),
  fixture("S005", "meal", "chicken shawarma plate", "meal_idea", { expectedTopId: "meal:shawarma" }),
  fixture("S006", "meal", "cobb salad", "meal_idea", { expectedTopId: "meal:cobb-salad" }),
  fixture("S007", "meal", "cobb salad with chicken", "meal_idea", { expectedTopId: "meal:cobb-salad" }),
  fixture("S008", "meal", "taco night", "meal_idea", { expectedTopId: "meal:tacos" }),
  fixture("S009", "meal", "ground beef tacos", "meal_idea", { expectedTopId: "meal:tacos" }),
  fixture("S010", "meal", "pasta dinner", "meal_idea", { expectedTopId: "meal:pasta" }),
  fixture("S011", "meal", "chicken curry", "meal_idea", { expectedTopId: "meal:curry" }),
  fixture("S012", "meal", "stir fry", "meal_idea", { expectedTopId: "meal:stir-fry" }),

  fixture("S013", "typo", "shwarma", "meal_idea", { expectedTopId: "meal:shawarma" }),
  fixture("S014", "typo", "spagetti dinner", "meal_idea", { expectedTopId: "meal:pasta" }),
  fixture("S015", "typo", "romain", "add_item", { expectedTopId: "product:romaine" }),
  fixture("S016", "typo", "letuce", "add_item", { expectedTopId: "product:romaine" }),
  fixture("S017", "typo", "avacado", "add_item", { expectedTopId: "product:avocado" }),
  fixture("S018", "typo", "bananna", "add_item", { expectedTopId: "product:bananas" }),
  fixture("S019", "typo", "cocnut milk", "add_item", { expectedTopId: "product:coconut-milk" }),
  fixture("S020", "typo", "tortila", "add_item", { expectedTopId: "product:tortillas" }),

  fixture("S021", "alias", "flatbread", "add_item", { expectedTopId: "product:pita" }),
  fixture("S022", "alias", "greek yogurt", "add_item", { expectedTopId: "product:plain-yogurt" }),
  fixture("S023", "alias", "cheddar", "add_item", { expectedTopId: "product:shredded-cheese" }),
  fixture("S024", "alias", "pasta sauce", "add_item", { expectedTopId: "product:marinara" }),
  fixture("S025", "alias", "oatmilk", "add_item", { expectedTopId: "product:oat-milk" }),
  fixture("S026", "alias", "long grain rice", "add_item", { expectedTopId: "product:rice" }),
  fixture("S027", "alias", "taco shells", "add_item", { expectedTopId: "product:tortillas" }),
  fixture("S028", "alias", "middle eastern seasoning", "add_item", { expectedTopId: "product:shawarma-seasoning" }),

  fixture("S029", "ambiguous", "chicken", "meal_idea", { expectedIntent: "ambiguous", expectWarning: true }),
  fixture("S030", "ambiguous", "rice", "meal_idea", { expectedIntent: "ambiguous", expectWarning: true }),
  fixture("S031", "ambiguous", "sauce", "meal_idea", { expectedIntent: "ambiguous", expectWarning: true }),
  fixture("S032", "ambiguous", "salad", "meal_idea", { expectedIntent: "ambiguous", expectWarning: true }),
  fixture("S033", "ambiguous", "healthy lunches", "meal_idea", { expectedIntent: "ambiguous", expectWarning: true }),
  fixture("S034", "ambiguous", "dinner for four", "meal_idea", { expectedIntent: "ambiguous", expectWarning: true }),
  fixture("S035", "ambiguous", "protein", "meal_idea", { expectedIntent: "ambiguous", expectWarning: true }),
  fixture("S036", "ambiguous", "vegetables", "meal_idea", { expectedIntent: "ambiguous", expectWarning: true }),

  fixture("S037", "add_item", "shawarma", "add_item", { expectedTopId: "product:shawarma-seasoning" }),
  fixture("S038", "add_item", "shawarma spice", "add_item", { expectedTopId: "product:shawarma-seasoning" }),
  fixture("S039", "add_item", "pita", "add_item", { expectedTopId: "product:pita" }),
  fixture("S040", "add_item", "lettuce", "add_item", { expectedTopId: "product:romaine" }),
  fixture("S041", "add_item", "eggs", "add_item", { expectedTopId: "product:eggs" }),
  fixture("S042", "add_item", "curry", "add_item", { expectedTopId: "product:curry-paste" }),
  fixture("S043", "add_item", "fresh herb", "add_item", { expectedTopId: "product:parsley" }),
  fixture("S044", "add_item", "dairy free", "add_item", { expectedTopOneOf: ["product:oat-milk", "product:coconut-milk"] }),
  fixture("S045", "add_item", "protein", "add_item", { expectedIds: ["product:chicken-breast"] }),
  fixture("S046", "add_item", "sauce", "add_item", { expectedTopOneOf: ["product:marinara", "product:ranch", "product:salsa", "product:plain-yogurt"] }),

  fixture("S047", "constraint", "cheap tacos", "meal_idea", { expectedIntent: "optimize", expectedTopId: "meal:tacos" }),
  fixture("S048", "constraint", "best value pasta", "meal_idea", { expectedIntent: "optimize", expectedTopId: "meal:pasta" }),
  fixture("S049", "constraint", "organic eggs", "add_item", { expectedIntent: "constraint", expectedTopId: "product:eggs" }),
  fixture("S050", "constraint", "dairy free milk", "add_item", { expectedIntent: "constraint", expectedTopOneOf: ["product:oat-milk", "product:coconut-milk"] }),
  fixture("S051", "constraint", "under $20 tacos", "meal_idea", { expectedIntent: "constraint", expectedTopId: "meal:tacos" }),
  fixture("S052", "constraint", "pickup shawarma", "meal_idea", { expectedIntent: "constraint", expectedTopId: "meal:shawarma" }),
  fixture("S053", "constraint", "gluten free pasta", "meal_idea", { expectedIntent: "constraint", expectedTopId: "meal:pasta" }),
  fixture("S054", "constraint", "non organic eggs", "add_item", { expectedIntent: "constraint", expectedTopId: "product:eggs" }),

  fixture("S055", "unsupported", "moon milk", "add_item", { expectEmpty: true }),
  fixture("S056", "unsupported", "saturn feast", "meal_idea", { expectEmpty: true }),
  fixture("S057", "unsupported", "dragon fruit cereal", "add_item", { expectEmpty: true }),
  fixture("S058", "unsupported", "asteroid crackers", "add_item", { expectEmpty: true }),
  fixture("S059", "unsupported", "blue soup", "meal_idea", { expectEmpty: true }),
  fixture("S060", "unsupported", "martian brunch", "meal_idea", { expectEmpty: true }),

  fixture("S061", "semantic", "breakfast protein", "add_item", { expectedIds: ["product:eggs", "product:plain-yogurt", "product:turkey-sausage", "product:peanut-butter"] }),
  fixture("S062", "semantic", "plant based milk", "add_item", { expectedIds: ["product:oat-milk", "product:almond-milk", "product:coconut-milk"] }),
  fixture("S063", "semantic", "hydrating fruit", "add_item", { expectedIds: ["product:watermelon", "product:oranges"] }),
  fixture("S064", "semantic", "sandwich stuff", "add_item", { expectedIds: ["product:bread", "product:deli-turkey", "product:sliced-cheese"] }),
  fixture("S065", "semantic", "snacks for kids", "add_item", { expectedIds: ["product:apples", "product:string-cheese", "product:crackers"] }),
  fixture("S066", "semantic", "lunch protein", "add_item", { expectedIds: ["product:deli-turkey", "product:tuna"] }),
  fixture("S067", "semantic", "salad greens", "add_item", { expectedIds: ["product:spring-mix", "product:spinach", "product:romaine"] }),
  fixture("S068", "semantic", "stir fry vegetables", "add_item", { expectedIds: ["product:bell-peppers", "product:mushrooms", "product:zucchini"] }),
  fixture("S069", "semantic", "plant based protein", "add_item", { expectedIds: ["product:black-beans", "product:chickpeas", "product:tofu"] }),
  fixture("S070", "semantic", "easy dinner", "add_item", { expectedIds: ["product:frozen-pizza"] }),
  fixture("S071", "semantic", "smoothie fruit", "add_item", { expectedIds: ["product:bananas", "product:frozen-berries", "product:strawberries"] }),
  fixture("S072", "semantic", "bagel spread", "add_item", { expectedIds: ["product:cream-cheese"] }),
  fixture("S073", "semantic", "sandwich condiment", "add_item", { expectedIds: ["product:mustard", "product:mayonnaise", "product:pickles"] }),
  fixture("S074", "semantic", "cooking oil", "add_item", { expectedIds: ["product:olive-oil", "product:vegetable-oil"] }),
  fixture("S075", "semantic", "baking pantry", "add_item", { expectedIds: ["product:flour", "product:sugar", "product:chocolate-chips"] }),
  fixture("S076", "semantic", "breakfast drink", "add_item", { expectedIds: ["product:coffee", "product:orange-juice"] }),
  fixture("S077", "semantic", "hydrating drink", "add_item", { expectedIds: ["product:sparkling-water", "product:bottled-water"] }),
  fixture("S078", "semantic", "pet food", "add_item", { expectedIds: ["product:dog-food", "product:cat-food"] }),
  fixture("S079", "semantic", "baby cleanup", "add_item", { expectedIds: ["product:baby-wipes"] }),
  fixture("S080", "semantic", "household cleanup", "add_item", { expectedIds: ["product:paper-towels", "product:dish-soap"] }),
  fixture("S081", "add_item", "almondmilk", "add_item", { expectedTopId: "product:almond-milk" }),
  fixture("S082", "add_item", "turkey sausage", "add_item", { expectedTopId: "product:turkey-sausage" }),
  fixture("S083", "add_item", "watermelon", "add_item", { expectedTopId: "product:watermelon" }),
  fixture("S084", "add_item", "deli turkey", "add_item", { expectedTopId: "product:deli-turkey" }),
  fixture("S085", "add_item", "string cheese", "add_item", { expectedTopId: "product:string-cheese" }),
  fixture("S086", "add_item", "hummus", "add_item", { expectedTopId: "product:hummus" }),
  fixture("S087", "add_item", "black beans", "add_item", { expectedTopId: "product:black-beans" }),
  fixture("S088", "add_item", "tofu", "add_item", { expectedTopId: "product:tofu" }),
  fixture("S089", "add_item", "sparkling water", "add_item", { expectedTopId: "product:sparkling-water" }),
  fixture("S090", "add_item", "paper towels", "add_item", { expectedTopId: "product:paper-towels" }),
  fixture("S091", "typo", "almnd milk", "add_item", { expectedTopId: "product:almond-milk" }),
  fixture("S092", "typo", "watrmelon", "add_item", { expectedTopId: "product:watermelon" }),
  fixture("S093", "typo", "strawbery", "add_item", { expectedTopId: "product:strawberries" }),
  fixture("S094", "typo", "crakcers", "add_item", { expectedTopId: "product:crackers" }),
  fixture("S095", "typo", "hummos", "add_item", { expectedTopId: "product:hummus" }),
  fixture("S096", "alias", "lunch meat", "add_item", { expectedTopOneOf: ["product:deli-turkey", "product:deli-ham"] }),
  fixture("S097", "alias", "cheese slices", "add_item", { expectedTopId: "product:sliced-cheese" }),
  fixture("S098", "alias", "snack bars", "add_item", { expectedTopId: "product:granola-bars" }),
  fixture("S099", "alias", "oatmeal", "add_item", { expectedTopId: "product:rolled-oats" }),
  fixture("S100", "alias", "seltzer", "add_item", { expectedTopId: "product:sparkling-water" }),
  fixture("S101", "constraint", "dairy free plant milk", "add_item", { expectedIntent: "constraint", expectedIds: ["product:oat-milk", "product:almond-milk", "product:coconut-milk"] }),
  fixture("S102", "constraint", "organic strawberries", "add_item", { expectedIntent: "constraint", expectedTopId: "product:strawberries" }),
  fixture("S103", "constraint", "cheap breakfast protein", "add_item", { expectedIntent: "constraint", expectedIds: ["product:eggs", "product:turkey-sausage"] }),
  fixture("S104", "constraint", "gluten free snack", "add_item", { expectedIntent: "constraint", expectWarning: true }),
  fixture("S105", "semantic", "kid lunch snack", "add_item", { expectedIds: ["product:string-cheese", "product:crackers", "product:apples"] }),
  fixture("S106", "semantic", "quick breakfast", "add_item", { expectedIds: ["product:eggs", "product:bagels", "product:cereal"] }),
  fixture("S107", "semantic", "dinner side vegetable", "add_item", { expectedIds: ["product:broccoli", "product:sweet-potatoes", "product:potatoes"] }),
  fixture("S108", "semantic", "asian stir fry sauce", "add_item", { expectedIds: ["product:soy-sauce"] }),
  fixture("S109", "semantic", "taco protein", "add_item", { expectedIds: ["product:ground-beef", "product:black-beans", "product:shrimp"] }),
  fixture("S110", "semantic", "salad protein", "add_item", { expectedIds: ["product:chickpeas", "product:chicken-breast"] }),
  fixture("S111", "semantic", "school lunch", "add_item", { expectedIds: ["product:deli-turkey", "product:granola-bars", "product:apples"] }),
  fixture("S112", "semantic", "zero sugar drink", "add_item", { expectedIds: ["product:sparkling-water"] }),
  fixture("S113", "semantic", "vegan protein", "add_item", { expectedIds: ["product:tofu", "product:black-beans", "product:chickpeas"] }),
  fixture("S114", "semantic", "toast breakfast", "add_item", { expectedIds: ["product:bread", "product:avocado", "product:peanut-butter"] }),
  fixture("S115", "semantic", "soup vegetable", "add_item", { expectedIds: ["product:celery", "product:baby-carrots", "product:potatoes"] }),
  fixture("S116", "unsupported", "moon breakfast protein", "meal_idea", { expectEmpty: true }),
  fixture("S117", "unsupported", "interstellar kids snack", "add_item", { expectEmpty: true }),
  fixture("S118", "unsupported", "robot cooking oil", "add_item", { expectEmpty: true }),
  fixture("S119", "unsupported", "neptune pet food", "add_item", { expectEmpty: true }),
  fixture("S120", "ambiguous", "easy meal", "meal_idea", { expectedIntent: "ambiguous", expectWarning: true }),
  fixture("S121", "meal", "turkey breakfast plate", "meal_idea", { expectedTopId: "meal:turkey-breakfast-plate" }),
  fixture("S122", "meal", "turkey sandwich lunch", "meal_idea", { expectedTopId: "meal:turkey-sandwich-lunch" }),
  fixture("S123", "meal", "tuna salad sandwich", "meal_idea", { expectedTopId: "meal:tuna-salad-sandwich" }),
  fixture("S124", "meal", "salmon rice dinner", "meal_idea", { expectedTopId: "meal:salmon-rice-dinner" }),
  fixture("S125", "meal", "shrimp stir fry", "meal_idea", { expectedTopId: "meal:shrimp-stir-fry" }),
  fixture("S126", "meal", "tofu veggie stir fry", "meal_idea", { expectedTopId: "meal:tofu-veggie-stir-fry" }),
  fixture("S127", "meal", "hummus snack plate", "meal_idea", { expectedTopId: "meal:hummus-snack-plate" }),
  fixture("S128", "meal", "kids lunch box", "meal_idea", { expectedTopId: "meal:kids-lunch-box" }),
  fixture("S129", "meal", "oatmeal breakfast", "meal_idea", { expectedTopId: "meal:oatmeal-breakfast" }),
  fixture("S130", "meal", "black bean taco bowl", "meal_idea", { expectedTopId: "meal:black-bean-taco-bowl" }),
];

describe("Phase 2.5 search evaluation fixtures", () => {
  it("keeps protected Phase 2.5 baselines while expanding Phase 3.5 coverage", () => {
    const protectedBaselineCases = evaluationCases.filter((item) => Number(item.id.slice(1)) <= 60);

    expect(protectedBaselineCases).toHaveLength(60);
    expect(evaluationCases.length).toBeGreaterThanOrEqual(130);
    expect(new Set(evaluationCases.map((item) => item.id)).size).toBe(evaluationCases.length);

    for (const category of ["meal", "typo", "alias", "ambiguous", "add_item", "constraint", "semantic", "unsupported"]) {
      expect(evaluationCases.some((item) => item.category === category)).toBe(true);
    }
  });

  it.each(evaluationCases)("$id $category: $input", (searchCase) => {
    const query = deterministicSearchService.understandQuery(searchCase.input, { surface: searchCase.surface });
    const results = deterministicSearchService.search(searchCase.input, searchDocuments, {
      surface: searchCase.surface,
      limit: 8,
    });
    const resultIds = results.map((result) => result.document.id);

    if (searchCase.expectedIntent) {
      expect(query.intent).toBe(searchCase.expectedIntent);
    }

    if (searchCase.expectWarning) {
      expect(query.warnings.length > 0 || results.some((result) => result.warnings.length > 0)).toBe(true);
    }

    if (
      searchCase.expectedIntent === "ambiguous" &&
      !searchCase.expectedTopId &&
      !searchCase.expectedTopOneOf &&
      !searchCase.expectedIds
    ) {
      return;
    }

    if (searchCase.expectEmpty) {
      expect(results).toHaveLength(0);
      return;
    }

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].reasons.length).toBeGreaterThan(0);

    if (searchCase.expectedTopId) {
      expect(results[0].document.id).toBe(searchCase.expectedTopId);
    }

    if (searchCase.expectedTopOneOf) {
      expect(searchCase.expectedTopOneOf).toContain(results[0].document.id);
    }

    for (const expectedId of searchCase.expectedIds ?? []) {
      expect(resultIds).toContain(expectedId);
    }
  });
});

const searchDocuments: Array<SearchDocument<unknown>> = [
  ...mealProfiles.map((profile, index) => ({
    id: `meal:${profile.id}`,
    type: "meal_profile" as const,
    canonicalName: profile.id,
    displayName: profile.displayName,
    aliases: profile.aliases,
    tags: profile.tokenSignals,
    rank: index,
    payload: profile,
  })),
  ...knownNeeds.map((need, index) => ({
    id: `need:${need.canonicalName}`,
    type: "need_template" as const,
    canonicalName: need.canonicalName,
    displayName: need.displayName,
    aliases: need.keywords,
    category: need.category,
    tags: need.dietaryTags ?? [],
    rank: index,
    payload: need,
  })),
  ...products.map((product, index) => ({
    id: `product:${product.id}`,
    type: "product" as const,
    canonicalName: product.canonicalName,
    displayName: product.canonicalName,
    aliases: product.aliases ?? [],
    category: product.category,
    subcategory: product.subcategory,
    tags: product.tags,
    semanticTags: product.semanticTags,
    dietaryTags: product.dietaryTags,
    rank: index,
    payload: product,
  })),
];

function fixture(
  id: string,
  category: SearchEvaluationCase["category"],
  input: string,
  surface: SearchSurface,
  expectations: Omit<SearchEvaluationCase, "id" | "category" | "input" | "surface">,
): SearchEvaluationCase {
  return {
    id,
    category,
    input,
    surface,
    ...expectations,
  };
}
