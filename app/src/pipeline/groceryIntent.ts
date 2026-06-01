import type { GroceryNeed } from "@/domain/grocery";
import { normalizeText, type SearchContext } from "@/pipeline/search";
import { z } from "zod";

export const groceryIntentInterpretationSchema = z.object({
  rawInput: z.string(),
  normalizedInput: z.string(),
  coreQuery: z.string(),
  mode: z.enum(["meal", "list", "add_item"]),
  constraints: z.object({
    dietaryTags: z.array(z.string()),
    organic: z.boolean().optional(),
    priceIntent: z.enum(["cheap", "best_value"]).optional(),
  }),
  fulfillmentHint: z.enum(["pickup", "delivery"]).optional(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

export type GroceryIntentInterpretation = z.infer<typeof groceryIntentInterpretationSchema>;

export type ParsedGroceryIntent = Pick<GroceryIntentInterpretation, "coreQuery" | "constraints">;

export interface GroceryIntentInterpreter {
  interpret(input: string, context: SearchContext): Promise<GroceryIntentInterpretation>;
}

export interface SyncGroceryIntentInterpreter extends GroceryIntentInterpreter {
  interpretSync(input: string, context: SearchContext): GroceryIntentInterpretation;
}

type MutableIntent = {
  rawInput: string;
  normalizedInput: string;
  coreQuery: string;
  mode: GroceryIntentInterpretation["mode"];
  constraints: {
    dietaryTags: string[];
    organic?: boolean;
    priceIntent?: "cheap" | "best_value";
  };
  fulfillmentHint?: "pickup" | "delivery";
  confidence: number;
  warnings: string[];
};

const priceIntentPatterns = [
  /\bbest\s+value\b/g,
  /\bcheap(?:est)?\b/g,
  /\bbudget\b/g,
  /\bdeals?\b/g,
  /\bunder\s+\$?\d+(?:\.\d{1,2})?\b/g,
  /\bless\s+than\s+\$?\d+(?:\.\d{1,2})?\b/g,
  /\$\d+(?:\.\d{1,2})?/g,
];

export class DeterministicGroceryIntentInterpreter implements SyncGroceryIntentInterpreter {
  async interpret(input: string, context: SearchContext): Promise<GroceryIntentInterpretation> {
    return this.interpretSync(input, context);
  }

  interpretSync(input: string, context: SearchContext): GroceryIntentInterpretation {
    return validateIntentInterpretation(deterministicInterpret(input, context));
  }
}

export class MockModelGroceryIntentInterpreter implements SyncGroceryIntentInterpreter {
  async interpret(input: string, context: SearchContext): Promise<GroceryIntentInterpretation> {
    return this.interpretSync(input, context);
  }

  interpretSync(input: string, context: SearchContext): GroceryIntentInterpretation {
    return validateIntentInterpretation(mockModelInterpret(input, context));
  }
}

export class HybridGroceryIntentInterpreter implements SyncGroceryIntentInterpreter {
  constructor(
    private readonly deterministicInterpreter: SyncGroceryIntentInterpreter,
    private readonly mockModelInterpreter: SyncGroceryIntentInterpreter,
  ) {}

  async interpret(input: string, context: SearchContext): Promise<GroceryIntentInterpretation> {
    return this.interpretSync(input, context);
  }

  interpretSync(input: string, context: SearchContext): GroceryIntentInterpretation {
    const deterministic = this.deterministicInterpreter.interpretSync(input, context);
    const mockModel = this.mockModelInterpreter.interpretSync(input, context);
    const dietaryTags = Array.from(
      new Set([...deterministic.constraints.dietaryTags, ...mockModel.constraints.dietaryTags]),
    );
    const useMockCore =
      mockModel.constraints.dietaryTags.length > deterministic.constraints.dietaryTags.length ||
      (deterministic.constraints.organic === undefined && mockModel.constraints.organic !== undefined) ||
      (deterministic.constraints.priceIntent === undefined && mockModel.constraints.priceIntent !== undefined) ||
      (deterministic.fulfillmentHint === undefined && mockModel.fulfillmentHint !== undefined) ||
      (deterministic.coreQuery.includes("dary") || deterministic.coreQuery.includes("orgnic"));

    return validateIntentInterpretation({
      rawInput: input,
      normalizedInput: deterministic.normalizedInput,
      coreQuery: useMockCore ? mockModel.coreQuery : deterministic.coreQuery,
      mode: surfaceToMode(context.surface),
      constraints: {
        dietaryTags,
        organic: deterministic.constraints.organic ?? mockModel.constraints.organic,
        priceIntent: deterministic.constraints.priceIntent ?? mockModel.constraints.priceIntent,
      },
      fulfillmentHint: deterministic.fulfillmentHint ?? mockModel.fulfillmentHint,
      confidence: Math.max(deterministic.confidence, mockModel.confidence),
      warnings: Array.from(new Set([...deterministic.warnings, ...mockModel.warnings])),
    });
  }
}

export const deterministicGroceryIntentInterpreter = new DeterministicGroceryIntentInterpreter();
export const mockModelGroceryIntentInterpreter = new MockModelGroceryIntentInterpreter();
export const hybridGroceryIntentInterpreter = new HybridGroceryIntentInterpreter(
  deterministicGroceryIntentInterpreter,
  mockModelGroceryIntentInterpreter,
);

export function interpretGroceryIntentSync(input: string, context: SearchContext): GroceryIntentInterpretation {
  return hybridGroceryIntentInterpreter.interpretSync(input, context);
}

export async function interpretGroceryIntent(input: string, context: SearchContext): Promise<GroceryIntentInterpretation> {
  return hybridGroceryIntentInterpreter.interpret(input, context);
}

export function parseGroceryIntent(input: string): ParsedGroceryIntent {
  const parsed = interpretGroceryIntentSync(input, { surface: "grocery_list" });

  return {
    coreQuery: parsed.coreQuery,
    constraints: parsed.constraints,
  };
}

function deterministicInterpret(input: string, context: SearchContext): MutableIntent {
  let normalizedInput = normalizeText(input);
  const dietaryTags: string[] = [];
  let organic: boolean | undefined;
  let priceIntent: ParsedGroceryIntent["constraints"]["priceIntent"];
  let fulfillmentHint: GroceryIntentInterpretation["fulfillmentHint"];

  if (/\bdairy\s+free\b/.test(normalizedInput) || /\bdairyfree\b/.test(normalizedInput)) {
    dietaryTags.push("dairy-free");
    normalizedInput = normalizedInput.replace(/\bdairy\s+free\b/g, " ").replace(/\bdairyfree\b/g, " ");
  }

  if (/\bgluten\s+free\b/.test(normalizedInput) || /\bglutenfree\b/.test(normalizedInput)) {
    dietaryTags.push("gluten-free");
    normalizedInput = normalizedInput.replace(/\bgluten\s+free\b/g, " ").replace(/\bglutenfree\b/g, " ");
  }

  if (/\bnon\s+organic\b/.test(normalizedInput) || /\bnonorganic\b/.test(normalizedInput)) {
    organic = false;
    normalizedInput = normalizedInput.replace(/\bnon\s+organic\b/g, " ").replace(/\bnonorganic\b/g, " ");
  } else if (/\borganic\b/.test(normalizedInput)) {
    organic = true;
    normalizedInput = normalizedInput.replace(/\borganic\b/g, " ");
  }

  if (/\bbest\s+value\b/.test(normalizedInput)) {
    priceIntent = "best_value";
  } else if (/\bcheap(?:est)?\b|\bbudget\b|\bdeals?\b|\bunder\s+\$?\d+|\bless\s+than\s+\$?\d+|\$\d+/.test(normalizedInput)) {
    priceIntent = "cheap";
  }

  for (const pattern of priceIntentPatterns) {
    normalizedInput = normalizedInput.replace(pattern, " ");
  }

  if (/\bpickup\b/.test(normalizedInput)) {
    fulfillmentHint = "pickup";
  }

  if (/\bdelivery\b/.test(normalizedInput)) {
    fulfillmentHint = "delivery";
  }

  normalizedInput = normalizedInput
    .replace(/\bpickup\b/g, " ")
    .replace(/\bdelivery\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    rawInput: input,
    normalizedInput: normalizeText(input),
    coreQuery: normalizedInput || normalizeText(input),
    mode: surfaceToMode(context.surface),
    constraints: {
      dietaryTags: Array.from(new Set(dietaryTags)),
      organic,
      priceIntent,
    },
    fulfillmentHint,
    confidence: 0.82,
    warnings: [],
  };
}

function mockModelInterpret(input: string, context: SearchContext): MutableIntent {
  const normalizedInput = normalizeText(input);
  const tokens = normalizedInput.split(" ").filter(Boolean);
  const keptTokens: string[] = [];
  const dietaryTags: string[] = [];
  let organic: boolean | undefined;
  let priceIntent: ParsedGroceryIntent["constraints"]["priceIntent"];
  let fulfillmentHint: GroceryIntentInterpretation["fulfillmentHint"];
  let interpretedModifier = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextToken = tokens[index + 1];
    const prevToken = tokens[index - 1];

    if (isCloseToken(token, ["dairy", "dary", "darie", "dairie", "lactose"]) && isCloseToken(nextToken, ["free"])) {
      dietaryTags.push("dairy-free");
      interpretedModifier = true;
      index += 1;
      continue;
    }

    if (isCloseToken(token, ["non", "no", "without"]) && isCloseToken(nextToken, ["dairy", "dary", "darie", "dairie", "lactose"])) {
      dietaryTags.push("dairy-free");
      interpretedModifier = true;
      index += 1;
      continue;
    }

    if (isCloseToken(token, ["dairy", "dary", "darie", "dairie", "lactose"]) && isCloseToken(prevToken, ["non", "no", "without"])) {
      interpretedModifier = true;
      continue;
    }

    if (isCloseToken(token, ["gluten"]) && isCloseToken(nextToken, ["free"])) {
      dietaryTags.push("gluten-free");
      interpretedModifier = true;
      index += 1;
      continue;
    }

    if (isCloseToken(token, ["non", "no", "not"]) && isCloseToken(nextToken, ["organic"])) {
      organic = false;
      interpretedModifier = true;
      index += 1;
      continue;
    }

    if (isCloseToken(token, ["organic"])) {
      organic = true;
      interpretedModifier = true;
      continue;
    }

    if (isCloseToken(token, ["best"]) && isCloseToken(nextToken, ["value"])) {
      priceIntent = "best_value";
      interpretedModifier = true;
      index += 1;
      continue;
    }

    if (isCloseToken(token, ["cheap", "cheapest", "budget", "deal", "deals"]) || isPriceToken(token)) {
      priceIntent = "cheap";
      interpretedModifier = true;
      continue;
    }

    if (isCloseToken(token, ["low"]) && isCloseToken(nextToken, ["cost", "price"])) {
      priceIntent = "cheap";
      interpretedModifier = true;
      index += 1;
      continue;
    }

    if (isCloseToken(token, ["under", "less"]) && nextToken && /^\d+/.test(nextToken)) {
      priceIntent = "cheap";
      interpretedModifier = true;
      index += 1;
      continue;
    }

    if (isCloseToken(token, ["pickup"])) {
      fulfillmentHint = "pickup";
      interpretedModifier = true;
      continue;
    }

    if (isCloseToken(token, ["delivery"])) {
      fulfillmentHint = "delivery";
      interpretedModifier = true;
      continue;
    }

    keptTokens.push(token);
  }

  const coreQuery = keptTokens.join(" ").trim() || normalizedInput;

  return {
    rawInput: input,
    normalizedInput,
    coreQuery,
    mode: surfaceToMode(context.surface),
    constraints: {
      dietaryTags: Array.from(new Set(dietaryTags)),
      organic,
      priceIntent,
    },
    fulfillmentHint,
    confidence: interpretedModifier ? 0.86 : 0.72,
    warnings: interpretedModifier ? ["Intent modifiers were normalized before search."] : [],
  };
}

export function applyParsedIntentToNeed<TNeed extends GroceryNeed>(
  need: TNeed,
  parsedIntent: ParsedGroceryIntent,
): TNeed {
  const dietaryTags = Array.from(
    new Set([...(need.constraints.dietaryTags ?? []), ...parsedIntent.constraints.dietaryTags]),
  );

  return {
    ...need,
    constraints: {
      ...need.constraints,
      dietaryTags,
      organic: parsedIntent.constraints.organic ?? need.constraints.organic,
    },
  };
}

function validateIntentInterpretation(intent: MutableIntent): GroceryIntentInterpretation {
  return groceryIntentInterpretationSchema.parse({
    ...intent,
    coreQuery: intent.coreQuery || intent.normalizedInput,
    constraints: {
      ...intent.constraints,
      dietaryTags: Array.from(new Set(intent.constraints.dietaryTags)),
    },
  });
}

function surfaceToMode(surface: SearchContext["surface"]): GroceryIntentInterpretation["mode"] {
  if (surface === "meal_idea") {
    return "meal";
  }

  if (surface === "grocery_list") {
    return "list";
  }

  return "add_item";
}

function isCloseToken(token: string | undefined, targets: string[]): boolean {
  if (!token) {
    return false;
  }

  return targets.some((target) => {
    if (token === target) {
      return true;
    }

    const longestLength = Math.max(token.length, target.length, 1);
    const similarity = 1 - editDistance(token, target) / longestLength;

    return token.length >= 3 && target.length >= 3 && similarity >= 0.72;
  });
}

function isPriceToken(token: string): boolean {
  return /^\d+(?:\.\d{1,2})?$/.test(token);
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
