import type {
  GroceryInferenceResult,
  GroceryNeed,
  GroceryNeedSource,
  NeedGenerationContext,
  NeedGenerator,
  SubstitutionPolicy,
  UserPreferences,
} from "@/domain/grocery";
import { mealProfiles, type MealProfile } from "@/data/mealProfiles";
import { applyParsedIntentToNeed, interpretGroceryIntentSync, type ParsedGroceryIntent } from "@/pipeline/groceryIntent";
import { modelInferenceResultSchema, type InferredNeedInput, toGroceryNeed } from "@/pipeline/needSchema";
import { deterministicSearchService, normalizeText, type SearchContext, type SearchDocument } from "@/pipeline/search";

type NeedTemplate = {
  canonicalName: string;
  displayName: string;
  category: string;
  subcategory?: string;
  quantity: number;
  unit: string;
  keywords: string[];
  substitutionPolicy?: SubstitutionPolicy;
  dietaryTags?: string[];
  semanticTags?: string[];
};

const cobbSaladNeeds: NeedTemplate[] = [
  template("romaine lettuce", "Romaine lettuce", "produce", 1, "pack", ["romaine", "lettuce", "salad"]),
  template("chicken breast", "Chicken breast", "meat", 2, "lb", ["chicken"]),
  template("eggs", "Eggs", "dairy", 6, "ct", ["egg", "eggs"]),
  template("bacon", "Bacon", "meat", 8, "oz", ["bacon"]),
  template("avocado", "Avocados", "produce", 2, "ct", ["avocado"]),
  template("tomatoes", "Tomatoes", "produce", 10, "oz", ["tomato", "tomatoes"]),
  template("blue cheese", "Blue cheese", "dairy", 4, "oz", ["blue cheese", "cheese"], "similar"),
  template("ranch dressing", "Ranch dressing", "pantry", 1, "bottle", ["ranch", "dressing"], "flexible"),
];

export const knownNeeds: NeedTemplate[] = [
  ...cobbSaladNeeds,
  template("white rice", "White rice", "pantry", 1, "bag", ["rice"], "flexible"),
  template("milk", "Milk", "dairy", 1, "gal", ["milk", "whole milk"]),
  template("sandwich bread", "Sandwich bread", "bakery", 1, "loaf", ["bread"], "flexible", [], ["sandwich", "lunch", "toast", "breakfast"]),
  template("bananas", "Bananas", "produce", 2, "lb", ["banana", "bananas"], "flexible"),
  template("oat milk", "Oat milk", "dairy", 1, "carton", ["oat milk", "oatmilk"], "similar", ["dairy-free"], ["plant based", "milk alternative", "lactose free"]),
  template("peanut butter", "Peanut butter", "pantry", 1, "jar", ["peanut butter"], "flexible"),
  template("lamb", "Lamb", "meat", 1.5, "lb", ["lamb"], "similar"),
  template("pita bread", "Pita bread", "bakery", 1, "pack", ["pita", "flatbread", "pita bread"], "similar"),
  template("cucumber", "Cucumber", "produce", 2, "ct", ["cucumber"], "flexible"),
  template("red onion", "Red onion", "produce", 1, "ct", ["red onion", "onion"], "flexible"),
  template("plain yogurt", "Plain yogurt", "dairy", 1, "tub", ["plain yogurt", "yogurt"], "similar"),
  template("lemon", "Lemon", "produce", 2, "ct", ["lemon", "lemons"], "flexible"),
  template("garlic", "Garlic", "produce", 1, "bulb", ["garlic"], "flexible"),
  template("shawarma seasoning", "Shawarma seasoning", "pantry", 1, "jar", ["shawarma seasoning", "shawarma spice"], "similar"),
  template("parsley", "Parsley", "produce", 1, "bunch", ["parsley"], "flexible"),
  template("ground beef", "Ground beef", "meat", 1, "lb", ["ground beef", "beef"], "similar"),
  template("tortillas", "Tortillas", "bakery", 1, "pack", ["tortilla", "tortillas"], "similar"),
  template("shredded cheese", "Shredded cheese", "dairy", 1, "bag", ["shredded cheese", "cheddar"], "similar"),
  template("salsa", "Salsa", "pantry", 1, "jar", ["salsa"], "flexible"),
  template("pasta", "Pasta", "pantry", 1, "box", ["pasta", "spaghetti"], "flexible"),
  template("marinara sauce", "Marinara sauce", "pantry", 1, "jar", ["marinara", "pasta sauce"], "flexible"),
  template("parmesan cheese", "Parmesan cheese", "dairy", 1, "wedge", ["parmesan"], "similar"),
  template("chicken thighs", "Chicken thighs", "meat", 2, "lb", ["chicken thighs"], "similar"),
  template("coconut milk", "Coconut milk", "pantry", 2, "can", ["coconut milk"], "similar", ["dairy-free"]),
  template("curry paste", "Curry paste", "pantry", 1, "jar", ["curry paste", "curry"], "similar"),
  template("bell peppers", "Bell peppers", "produce", 3, "ct", ["bell pepper", "peppers"], "flexible"),
  template("fresh dill", "Fresh dill", "produce", 1, "bunch", ["fresh dill", "dill"], "flexible"),
  template("sumac", "Sumac", "pantry", 1, "jar", ["sumac"], "flexible"),
  template("almond milk", "Almond milk", "dairy", 1, "carton", ["almond milk", "almondmilk"], "similar", ["dairy-free"], ["plant based", "milk alternative", "lactose free"]),
  template("turkey sausage", "Turkey sausage", "meat", 12, "oz", ["turkey sausage", "breakfast sausage"], "similar", [], ["breakfast", "protein", "lean protein"]),
  template("watermelon", "Watermelon", "produce", 1, "ct", ["watermelon", "melon"], "flexible", [], ["hydrating", "fruit", "snack"]),
  template("oranges", "Oranges", "produce", 4, "lb", ["oranges", "orange"], "flexible", [], ["hydrating", "fruit", "kids"]),
  template("strawberries", "Strawberries", "produce", 1, "lb", ["strawberries", "strawberry"], "flexible", [], ["breakfast", "snack", "fruit"]),
  template("blueberries", "Blueberries", "produce", 1, "ct", ["blueberries", "blueberry"], "flexible", [], ["breakfast", "snack", "fruit"]),
  template("apples", "Apples", "produce", 3, "lb", ["apples", "apple"], "flexible", [], ["snack", "kids", "fruit"]),
  template("baby carrots", "Baby carrots", "produce", 1, "lb", ["baby carrots", "carrots"], "flexible", [], ["snack", "kids", "vegetable"]),
  template("spinach", "Spinach", "produce", 1, "bag", ["spinach", "baby spinach"], "flexible", [], ["salad", "greens", "sandwich"]),
  template("spring mix", "Spring mix", "produce", 1, "bag", ["spring mix", "mixed greens"], "flexible", [], ["salad", "greens"]),
  template("broccoli", "Broccoli", "produce", 1, "lb", ["broccoli"], "flexible", [], ["vegetable", "side"]),
  template("mushrooms", "Mushrooms", "produce", 8, "oz", ["mushrooms", "sliced mushrooms"], "flexible", [], ["stir fry", "pasta"]),
  template("deli turkey", "Deli turkey", "meat", 9, "oz", ["deli turkey", "turkey slices", "lunch meat", "turkey"], "similar", [], ["sandwich", "lunch", "protein"]),
  template("deli ham", "Deli ham", "meat", 9, "oz", ["deli ham", "ham slices"], "similar", [], ["sandwich", "lunch", "protein"]),
  template("sliced cheese", "Sliced cheese", "dairy", 1, "pack", ["sliced cheese", "cheese slices"], "similar", [], ["sandwich", "lunch"]),
  template("string cheese", "String cheese", "dairy", 12, "ct", ["string cheese"], "similar", [], ["snack", "kids", "protein"]),
  template("hummus", "Hummus", "deli", 1, "tub", ["hummus"], "flexible", ["dairy-free"], ["snack", "plant based", "dip"]),
  template("crackers", "Crackers", "pantry", 1, "box", ["crackers", "snack crackers"], "flexible", [], ["snack", "kids", "lunch"]),
  template("pretzels", "Pretzels", "pantry", 1, "bag", ["pretzels"], "flexible", [], ["snack", "kids"]),
  template("granola bars", "Granola bars", "pantry", 1, "box", ["granola bars", "snack bars"], "flexible", [], ["snack", "kids", "breakfast"]),
  template("rolled oats", "Rolled oats", "pantry", 1, "box", ["rolled oats", "oatmeal"], "flexible", [], ["breakfast", "grain"]),
  template("cereal", "Cereal", "pantry", 1, "box", ["cereal", "breakfast cereal"], "flexible", [], ["breakfast", "kids"]),
  template("bagels", "Bagels", "bakery", 1, "pack", ["bagels"], "flexible", [], ["breakfast", "sandwich"]),
  template("tuna", "Tuna", "pantry", 1, "can", ["tuna", "canned tuna"], "similar", [], ["protein", "sandwich", "lunch"]),
  template("black beans", "Black beans", "pantry", 1, "can", ["black beans", "beans"], "flexible", ["dairy-free"], ["plant based", "protein", "tacos"]),
  template("chickpeas", "Chickpeas", "pantry", 1, "can", ["chickpeas", "garbanzo beans"], "flexible", ["dairy-free"], ["plant based", "protein"]),
  template("tofu", "Tofu", "dairy", 1, "pack", ["tofu", "firm tofu"], "similar", ["dairy-free"], ["plant based", "protein", "stir fry"]),
  template("salmon", "Salmon", "seafood", 1, "lb", ["salmon"], "similar", [], ["protein", "dinner"]),
  template("shrimp", "Shrimp", "seafood", 12, "oz", ["shrimp"], "similar", [], ["protein", "stir fry", "tacos"]),
  template("soy sauce", "Soy sauce", "pantry", 1, "bottle", ["soy sauce"], "flexible", [], ["stir fry", "sauce"]),
  template("mustard", "Mustard", "pantry", 1, "bottle", ["mustard"], "flexible", [], ["sandwich", "condiment"]),
  template("mayonnaise", "Mayonnaise", "pantry", 1, "jar", ["mayonnaise", "mayo"], "flexible", [], ["sandwich", "condiment"]),
  template("pickles", "Pickles", "pantry", 1, "jar", ["pickles"], "flexible", [], ["sandwich", "snack"]),
  template("sparkling water", "Sparkling water", "beverages", 1, "pack", ["sparkling water", "seltzer"], "flexible", [], ["hydrating", "beverage"]),
];

export class TemplateNeedGenerator implements NeedGenerator {
  async generate(input: string, context: NeedGenerationContext): Promise<GroceryInferenceResult> {
    return {
      needs: generateTemplateNeeds(input, context.source, context),
      warnings: [],
    };
  }
}

export class MockModelNeedGenerator implements NeedGenerator {
  async generate(input: string, context: NeedGenerationContext): Promise<GroceryInferenceResult> {
    const ambiguousQuestion = getAmbiguousMealQuestion(input);
    const parsedIntent = interpretGroceryIntentSync(input, { surface: "meal_idea" });
    const composedInference = composeMealRequest(input, parsedIntent);

    if (composedInference) {
      return validateMockMealInference(composedInference, parsedIntent, context);
    }

    const profileMatch = findBestMealProfile(parsedIntent.coreQuery);

    if (!profileMatch) {
      return {
        needs: [],
        clarifyingQuestion: ambiguousQuestion ?? "I could not confidently infer that meal from the mock Phase 2 meal profiles yet.",
        warnings: [
          ambiguousQuestion
            ? "The request needs a more specific meal, dish, or grocery list before cart building."
            : "No mock model meal profile matched this request. Try shawarma, tacos, pasta dinner, curry, stir fry, sandwiches, salmon dinner, or oatmeal breakfast.",
        ],
      };
    }

    const inferredNeeds = applyMealConstraints(applyMealVariants(profileMatch.profile, parsedIntent.coreQuery), parsedIntent);
    return validateMockMealInference(
      {
        needs: inferredNeeds.needs,
        warnings: [
          `Inferred from a mock model meal profile: ${profileMatch.profile.displayName}. Live OpenAI inference is planned after Phase 2.`,
          ...inferredNeeds.warnings,
          ...(profileMatch.score < 80 ? ["The meal request was brief, so the cart should be reviewed before purchase."] : []),
        ],
      },
      parsedIntent,
      context,
    );
  }
}

function validateMockMealInference(
  inference: { needs: InferredNeedInput[]; warnings: string[] },
  parsedIntent: ParsedGroceryIntent,
  context: NeedGenerationContext,
): GroceryInferenceResult {
  const modelOutput = {
    needs: inference.needs,
    warnings: inference.warnings,
  };
  const parsed = modelInferenceResultSchema.safeParse(modelOutput);

  if (!parsed.success) {
    return {
      needs: [],
      clarifyingQuestion: "The inferred meal needs failed validation.",
      warnings: ["Mock model output was rejected before cart optimization."],
    };
  }

  return {
    needs: parsed.data.needs.map((item, index) =>
      applyParsedIntentToNeed(toGroceryNeed(item, index, context.source, context), parsedIntent),
    ),
    clarifyingQuestion: parsed.data.clarifyingQuestion,
    warnings: parsed.data.warnings,
  };
}

function composeMealRequest(
  input: string,
  parsedIntent: ParsedGroceryIntent,
): { needs: InferredNeedInput[]; warnings: string[] } | null {
  const segments = splitComposedMealQuery(input);

  if (segments.length < 2) {
    return null;
  }

  const needs = new Map<string, InferredNeedInput>();
  const warnings: string[] = [];
  const matchedProfileNames: string[] = [];
  let matchedPieceCount = 0;
  let lowConfidenceMatch = false;

  for (const segment of segments) {
    const segmentIntent = mergeParsedIntent(parsedIntent, interpretGroceryIntentSync(segment, { surface: "meal_idea" }));
    const profileMatch = findBestMealProfile(segmentIntent.coreQuery);

    if (profileMatch) {
      const inferredNeeds = applyMealConstraints(
        applyMealVariants(profileMatch.profile, segmentIntent.coreQuery),
        segmentIntent,
      );

      matchedPieceCount += 1;
      lowConfidenceMatch ||= profileMatch.score < 80;
      matchedProfileNames.push(profileMatch.profile.displayName);
      warnings.push(...inferredNeeds.warnings);

      for (const need of inferredNeeds.needs) {
        mergeInferredNeed(needs, need);
      }

      continue;
    }

    const templateMatch = findBestNeedTemplate(segmentIntent.coreQuery, segmentIntent);

    if (templateMatch) {
      matchedPieceCount += 1;
      mergeInferredNeed(needs, templateToInferredNeed(templateMatch));
    }
  }

  if (matchedPieceCount < 2 || needs.size === 0) {
    return null;
  }

  return {
    needs: Array.from(needs.values()),
    warnings: [
      composedMealWarning(matchedProfileNames),
      ...Array.from(new Set(warnings)),
      ...(lowConfidenceMatch ? ["The meal request was brief, so the cart should be reviewed before purchase."] : []),
    ],
  };
}

function splitComposedMealQuery(input: string): string[] {
  return input
    .replace(/[,;+&]/g, " and ")
    .split(/\s*(?:,|;|\+|&|\band\b|\bplus\b|\balso\b)\s*/g)
    .map((segment) => normalizeText(segment).trim())
    .filter((segment) => segment.length > 1);
}

function mergeParsedIntent(
  fullIntent: ParsedGroceryIntent,
  segmentIntent: ParsedGroceryIntent,
): ParsedGroceryIntent {
  return {
    coreQuery: segmentIntent.coreQuery,
    constraints: {
      dietaryTags: Array.from(
        new Set([...fullIntent.constraints.dietaryTags, ...segmentIntent.constraints.dietaryTags]),
      ),
      organic: segmentIntent.constraints.organic ?? fullIntent.constraints.organic,
      priceIntent: segmentIntent.constraints.priceIntent ?? fullIntent.constraints.priceIntent,
    },
  };
}

function mergeInferredNeed(needs: Map<string, InferredNeedInput>, nextNeed: InferredNeedInput) {
  const existingNeed = needs.get(nextNeed.canonicalName);

  if (!existingNeed) {
    needs.set(nextNeed.canonicalName, { ...nextNeed });
    return;
  }

  const quantity =
    existingNeed.unit === nextNeed.unit
      ? roundQuantity(existingNeed.quantity + nextNeed.quantity)
      : existingNeed.quantity;

  needs.set(nextNeed.canonicalName, {
    ...existingNeed,
    quantity,
    confidence: Math.max(existingNeed.confidence, nextNeed.confidence),
    dietaryTags: Array.from(new Set([...(existingNeed.dietaryTags ?? []), ...(nextNeed.dietaryTags ?? [])])),
    substitutionPolicy: stricterSubstitutionPolicy(existingNeed.substitutionPolicy, nextNeed.substitutionPolicy),
  });
}

function templateToInferredNeed(templateItem: NeedTemplate): InferredNeedInput {
  return {
    canonicalName: templateItem.canonicalName,
    displayName: templateItem.displayName,
    category: templateItem.category,
    quantity: templateItem.quantity,
    unit: templateItem.unit,
    confidence: 0.78,
    substitutionPolicy: templateItem.substitutionPolicy ?? "similar",
    dietaryTags: templateItem.dietaryTags ?? [],
  };
}

function roundQuantity(quantity: number): number {
  return Math.round(quantity * 100) / 100;
}

function stricterSubstitutionPolicy(
  left: SubstitutionPolicy | undefined,
  right: SubstitutionPolicy | undefined,
): SubstitutionPolicy {
  const order: SubstitutionPolicy[] = ["flexible", "similar", "strict"];
  const leftIndex = order.indexOf(left ?? "similar");
  const rightIndex = order.indexOf(right ?? "similar");

  return order[Math.max(leftIndex, rightIndex)];
}

function composedMealWarning(profileNames: string[]): string {
  if (profileNames.length === 0) {
    return "Inferred from multiple grocery needs in the meal request.";
  }

  if (profileNames.length === 1) {
    return `Inferred from a mock model meal profile: ${profileNames[0]}. Live OpenAI inference is planned after Phase 2.`;
  }

  return `Inferred from mock model meal profiles: ${profileNames.join(", ")}. Live OpenAI inference is planned after Phase 2.`;
}

export class HybridNeedGenerator implements NeedGenerator {
  constructor(
    private readonly templateGenerator: NeedGenerator,
    private readonly modelGenerator: NeedGenerator,
  ) {}

  async generate(input: string, context: NeedGenerationContext): Promise<GroceryInferenceResult> {
    if (context.source !== "manual_list") {
      const modelResult = await this.modelGenerator.generate(input, context);

      if (modelResult.needs.length > 0) {
        return mergeExplicitAddOns(modelResult, input, context);
      }

      if (modelResult.clarifyingQuestion) {
        return modelResult;
      }
    }

    const templateResult = await this.templateGenerator.generate(input, context);

    if (templateResult.needs.length > 0) {
      return templateResult;
    }

    if (context.source === "manual_list") {
      return {
        needs: [],
        warnings: ["No items from the manual list matched the targeted mock catalog."],
      };
    }

    return this.modelGenerator.generate(input, context);
  }
}

export const templateNeedGenerator = new TemplateNeedGenerator();
export const mockModelNeedGenerator = new MockModelNeedGenerator();
export const hybridNeedGenerator = new HybridNeedGenerator(templateNeedGenerator, mockModelNeedGenerator);

export async function generateGroceryInference(
  input: string,
  source: GroceryNeedSource,
  preferences: UserPreferences,
): Promise<GroceryInferenceResult> {
  return hybridNeedGenerator.generate(input, {
    ...preferences,
    source,
  });
}

export function generateGroceryNeeds(
  input: string,
  source: GroceryNeedSource,
  preferences: UserPreferences,
): GroceryNeed[] {
  return generateTemplateNeeds(input, source, preferences);
}

function generateTemplateNeeds(
  input: string,
  source: GroceryNeedSource,
  preferences: UserPreferences,
): GroceryNeed[] {
  const parsedInput = interpretGroceryIntentSync(input, intentContextForSource(source));
  const normalizedInput = parsedInput.coreQuery;
  const templates = new Map<string, { item: NeedTemplate; parsedIntent: ParsedGroceryIntent }>();

  if (normalizedInput.includes("cobb")) {
    for (const item of cobbSaladNeeds) {
      templates.set(item.canonicalName, { item, parsedIntent: parsedInput });
    }
  }

  if (source === "manual_list") {
    for (const line of input.split(/\n|,/).map((item) => item.trim()).filter(Boolean)) {
      const parsedLine = interpretGroceryIntentSync(line, { surface: "grocery_list" });
      const match = findBestNeedTemplate(parsedLine.coreQuery, parsedLine);

      if (match) {
        templates.set(match.canonicalName, { item: match, parsedIntent: parsedLine });
      }
    }
  } else {
    for (const item of knownNeeds) {
      if (item.keywords.some((keyword) => normalizedInput.includes(keyword))) {
        templates.set(item.canonicalName, { item, parsedIntent: parsedInput });
      }
    }
  }

  return Array.from(templates.values()).map(({ item, parsedIntent }, index) =>
    templateToNeed(item, index, source, preferences, parsedIntent),
  );
}

function intentContextForSource(source: GroceryNeedSource): SearchContext {
  return { surface: source === "manual_list" ? "grocery_list" : "meal_idea" };
}

function templateToNeed(
  item: NeedTemplate,
  index: number,
  source: GroceryNeedSource,
  preferences: UserPreferences,
  parsedIntent: ParsedGroceryIntent = { coreQuery: "", constraints: { dietaryTags: [] } },
): GroceryNeed {
  return {
    id: `need-${index + 1}`,
    canonicalName: item.canonicalName,
    displayName: item.displayName,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    source,
    confidence: item.keywords.some((keyword) => item.canonicalName.includes(keyword)) ? 0.94 : 0.82,
    constraints: {
      organic: parsedIntent.constraints.organic ?? (preferences.organicPreference === "required" ? true : undefined),
      dietaryTags: Array.from(new Set([...(item.dietaryTags ?? []), ...parsedIntent.constraints.dietaryTags])),
      substitutionPolicy:
        preferences.brandFlexibility === "strict" ? "strict" : item.substitutionPolicy ?? "similar",
    },
  };
}

function findBestMealProfile(input: string): { profile: MealProfile; score: number } | null {
  const normalizedInput = normalizeText(input);
  const queryTokens = normalizedInput.split(" ").filter(Boolean);
  const [bestMatch] = deterministicSearchService.search(input, mealProfileDocuments(), {
    surface: "meal_idea",
    limit: 2,
  });

  if (!bestMatch || bestMatch.score < 55) {
    return null;
  }

  const exactProfilePhraseMatched = [
    bestMatch.document.canonicalName,
    bestMatch.document.displayName,
    ...bestMatch.document.aliases,
  ].some((phrase) => normalizeText(phrase) === normalizedInput);

  if (queryTokens.length === 1 && !exactProfilePhraseMatched && !hasCloseSingleTokenAlias(bestMatch.document.aliases, normalizedInput)) {
    return null;
  }

  return {
    profile: bestMatch.document.payload,
    score: bestMatch.score,
  };
}

function findBestNeedTemplate(input: string, parsedIntent: ParsedGroceryIntent): NeedTemplate | null {
  const constrainedMatch = findConstrainedNeedTemplate(input, parsedIntent);

  if (constrainedMatch) {
    return constrainedMatch;
  }

  const normalizedInput = normalizeText(input);
  const query = deterministicSearchService.understandQuery(input, { surface: "grocery_list" });
  const queryTokenCount = Math.max(query.normalizedTokens.length, 1);
  const [bestMatch] = deterministicSearchService.search(input, needTemplateDocuments(), {
    surface: "grocery_list",
    limit: 1,
  });

  const matchedEnoughTerms =
    bestMatch?.matchedTerms.includes(normalizedInput) ||
    (bestMatch?.matchedTerms.length ?? 0) >= queryTokenCount;

  if (!bestMatch || bestMatch.score < 70 || !matchedEnoughTerms) {
    return null;
  }

  return bestMatch.document.payload;
}

function findConstrainedNeedTemplate(input: string, parsedIntent: ParsedGroceryIntent): NeedTemplate | null {
  const normalizedInput = normalizeText(input);

  if (parsedIntent.constraints.dietaryTags.includes("dairy-free")) {
    const dairyFreeMatch = knownNeeds.find(
      (need) =>
        need.dietaryTags?.includes("dairy-free") &&
        [...need.keywords, need.canonicalName, need.displayName].some((term) => normalizeText(term).includes(normalizedInput)),
    );

    if (dairyFreeMatch) {
      return dairyFreeMatch;
    }

    if (["milk", "yogurt"].includes(normalizedInput)) {
      return knownNeeds.find((need) => need.canonicalName === "oat milk") ?? null;
    }
  }

  return null;
}

function getAmbiguousMealQuestion(input: string): string | undefined {
  const query = deterministicSearchService.understandQuery(input, { surface: "meal_idea" });

  if (query.intent === "ambiguous") {
    return "What meal or grocery list should I build from that?";
  }

  return undefined;
}

function applyMealVariants(profile: MealProfile, input: string): { needs: InferredNeedInput[]; warnings: string[] } {
  const normalizedInput = normalizeText(input);
  const needs = new Map(profile.needs.map((need) => [need.canonicalName, need]));
  const warnings: string[] = [];

  for (const variant of profile.variants ?? []) {
    const variantMatched = variant.whenAny.some((phrase) => containsPhrase(normalizedInput, normalizeText(phrase)));

    if (!variantMatched) {
      continue;
    }

    for (const [canonicalName, replacement] of Object.entries(variant.replace ?? {})) {
      needs.delete(canonicalName);
      needs.set(replacement.canonicalName, replacement);
    }

    for (const addition of variant.add ?? []) {
      needs.set(addition.canonicalName, addition);
    }

    warnings.push(...(variant.warnings ?? []));
  }

  return {
    needs: Array.from(needs.values()),
    warnings,
  };
}

function applyMealConstraints(
  inferredNeeds: { needs: InferredNeedInput[]; warnings: string[] },
  parsedIntent: ParsedGroceryIntent,
): { needs: InferredNeedInput[]; warnings: string[] } {
  let needs = inferredNeeds.needs;
  const warnings = [...inferredNeeds.warnings];

  if (parsedIntent.constraints.dietaryTags.includes("dairy-free")) {
    const filteredNeeds = needs.filter((need) => !["blue cheese", "parmesan cheese", "plain yogurt"].includes(need.canonicalName));

    if (filteredNeeds.length !== needs.length) {
      warnings.push("Removed dairy items to fit the dairy-free request.");
    }

    needs = filteredNeeds;
  }

  return {
    needs,
    warnings,
  };
}

function hasCloseSingleTokenAlias(aliases: string[], normalizedInput: string): boolean {
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);

    if (normalizedAlias.includes(" ")) {
      return false;
    }

    const longestLength = Math.max(normalizedAlias.length, normalizedInput.length, 1);

    return 1 - editDistance(normalizedAlias, normalizedInput) / longestLength >= 0.72;
  });
}

function editDistance(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));

  for (let row = 0; row <= left.length; row += 1) {
    rows[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    rows[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;

      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  return rows[left.length][right.length];
}

function mergeExplicitAddOns(
  modelResult: GroceryInferenceResult,
  input: string,
  context: NeedGenerationContext,
): GroceryInferenceResult {
  const addOnNeeds = generateTemplateNeeds(input, context.source, context).filter((need) =>
    hasAddOnCue(input, need),
  );

  if (addOnNeeds.length === 0) {
    return modelResult;
  }

  const needs = new Map(modelResult.needs.map((need) => [need.canonicalName, need]));

  for (const need of addOnNeeds) {
    if (!needs.has(need.canonicalName)) {
      needs.set(need.canonicalName, {
        ...need,
        id: `need-${needs.size + 1}`,
      });
    }
  }

  return {
    ...modelResult,
    needs: Array.from(needs.values()).map((need, index) => ({
      ...need,
      id: `need-${index + 1}`,
    })),
  };
}

function hasAddOnCue(input: string, need: GroceryNeed): boolean {
  const normalizedInput = normalizeText(input);
  const candidateTerms = [need.canonicalName, need.displayName]
    .map(normalizeText)
    .flatMap((term) => [term, term.split(" ").at(-1) ?? term]);

  return candidateTerms.some((term) =>
    [
      `with ${term}`,
      `and ${term}`,
      `plus ${term}`,
      `add ${term}`,
      `extra ${term}`,
    ].some((phrase) => containsPhrase(normalizedInput, phrase)),
  );
}

function containsPhrase(normalizedInput: string, normalizedPhrase: string): boolean {
  return ` ${normalizedInput} `.includes(` ${normalizedPhrase} `);
}

function mealProfileDocuments(): Array<SearchDocument<MealProfile>> {
  return mealProfiles.map((profile, rank) => ({
    id: profile.id,
    type: "meal_profile",
    canonicalName: profile.id,
    displayName: profile.displayName,
    aliases: profile.aliases,
    tags: profile.tokenSignals,
    rank,
    payload: profile,
  }));
}

function needTemplateDocuments(): Array<SearchDocument<NeedTemplate>> {
  return knownNeeds.map((need, rank) => ({
    id: need.canonicalName,
    type: "need_template",
    canonicalName: need.canonicalName,
    displayName: need.displayName,
    aliases: need.keywords,
    category: need.category,
    subcategory: need.subcategory,
    tags: need.dietaryTags ?? [],
    semanticTags: need.semanticTags,
    dietaryTags: need.dietaryTags,
    rank,
    payload: need,
  }));
}

function template(
  canonicalName: string,
  displayName: string,
  category: string,
  quantity: number,
  unit: string,
  keywords: string[],
  substitutionPolicy: SubstitutionPolicy = "similar",
  dietaryTags: string[] = [],
  semanticTags: string[] = [],
): NeedTemplate {
  return { canonicalName, displayName, category, quantity, unit, keywords, substitutionPolicy, dietaryTags, semanticTags };
}
