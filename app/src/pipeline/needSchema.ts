import { z } from "zod";
import type { GroceryNeed, GroceryNeedSource, UserPreferences } from "@/domain/grocery";

const substitutionPolicySchema = z.enum(["strict", "similar", "flexible"]);

export const inferredNeedSchema = z.object({
  canonicalName: z.string().min(1),
  displayName: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  confidence: z.number().min(0).max(1),
  substitutionPolicy: substitutionPolicySchema.default("similar"),
  dietaryTags: z.array(z.string()).default([]),
  uncertainty: z.string().optional(),
});

export const inferredNeedsSchema = z.array(inferredNeedSchema);

export const modelInferenceResultSchema = z.object({
  needs: inferredNeedsSchema,
  clarifyingQuestion: z.string().optional(),
  warnings: z.array(z.string()).default([]),
});

export type InferredNeedInput = z.infer<typeof inferredNeedSchema>;
export type ModelInferenceResultInput = z.infer<typeof modelInferenceResultSchema>;

export function toGroceryNeed(
  item: InferredNeedInput,
  index: number,
  source: GroceryNeedSource,
  preferences: UserPreferences,
): GroceryNeed {
  return {
    id: `need-${index + 1}`,
    canonicalName: item.canonicalName,
    displayName: item.displayName,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    source,
    confidence: item.confidence,
    constraints: {
      organic: preferences.organicPreference === "required" ? true : undefined,
      dietaryTags: item.dietaryTags.length > 0 ? item.dietaryTags : undefined,
      substitutionPolicy:
        preferences.brandFlexibility === "strict" ? "strict" : item.substitutionPolicy,
    },
  };
}
