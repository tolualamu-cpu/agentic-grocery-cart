import { z } from "zod";

const groceryNeedSchema = z.object({
  id: z.string().min(1).max(120),
  canonicalName: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  quantity: z.number().positive().max(1_000),
  unit: z.string().min(1).max(40),
  source: z.enum(["recipe", "manual_list", "past_cart", "meal_plan"]),
  confidence: z.number().min(0).max(1),
  constraints: z.object({
    organic: z.boolean().optional(),
    brandPreference: z.array(z.string().min(1).max(100)).max(20).optional(),
    dietaryTags: z.array(z.string().min(1).max(100)).max(20).optional(),
    substitutionPolicy: z.enum(["strict", "similar", "flexible"]),
    maxPrice: z.number().positive().max(10_000).optional(),
  }),
});

const userPreferencesSchema = z.object({
  optimizationGoal: z.enum(["cheapest", "best_value", "fewest_stores", "preferred_brands"]),
  maxStores: z.number().int().min(1).max(3),
  fulfillmentMode: z.enum(["pickup", "delivery"]),
  organicPreference: z.enum(["prefer", "prefer_non_organic", "required", "none"]),
  brandFlexibility: z.enum(["strict", "balanced", "flexible"]),
  budgetTarget: z.number().nonnegative().max(100_000),
});

export const krogerCartPreviewRequestSchema = z.object({
  locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  needs: z.array(groceryNeedSchema).min(1).max(40),
  preferences: userPreferencesSchema,
});

export const krogerCartRequestSchema = z.object({
  items: z
    .array(
      z.object({
        quantity: z.number().int().min(1).max(99),
        upc: z.string().regex(/^\d{8,14}$/),
        fulfillmentMode: z.enum(["pickup", "delivery"]),
      }),
    )
    .min(1)
    .max(100),
});
