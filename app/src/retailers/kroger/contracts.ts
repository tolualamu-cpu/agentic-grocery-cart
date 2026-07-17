import { z } from "zod";

const krogerImageSizeSchema = z.object({
  size: z.string().optional(),
  url: z.string().url(),
});

const krogerImageSchema = z.object({
  perspective: z.string().optional(),
  featured: z.boolean().optional(),
  sizes: z.array(krogerImageSizeSchema).default([]),
});

const krogerFulfillmentSchema = z.object({
  curbside: z.boolean().optional(),
  delivery: z.boolean().optional(),
  inStore: z.boolean().optional(),
  shipToHome: z.boolean().optional(),
});

const krogerPriceSchema = z.object({
  regular: z.number().nonnegative().optional(),
  promo: z.number().nonnegative().optional(),
});

export const krogerItemSchema = z.object({
  itemId: z.string(),
  size: z.string().optional(),
  soldBy: z.string().optional(),
  inventory: z.object({ stockLevel: z.string().optional() }).optional(),
  fulfillment: krogerFulfillmentSchema.optional(),
  price: krogerPriceSchema.optional(),
});

export const krogerProductSchema = z.object({
  productId: z.string(),
  upc: z.string(),
  brand: z.string().optional(),
  categories: z.array(z.string()).default([]),
  countryOrigin: z.string().optional(),
  description: z.string(),
  items: z.array(krogerItemSchema).default([]),
  itemInformation: z
    .object({
      depth: z.string().optional(),
      height: z.string().optional(),
      width: z.string().optional(),
    })
    .optional(),
  temperature: z
    .object({
      indicator: z.string().optional(),
      heatSensitive: z.boolean().optional(),
    })
    .optional(),
  images: z.array(krogerImageSchema).default([]),
});

export const krogerProductsResponseSchema = z.object({
  data: z.array(krogerProductSchema).default([]),
});

export const krogerLocationSchema = z.object({
  locationId: z.string(),
  chain: z.string().optional(),
  name: z.string(),
  address: z
    .object({
      addressLine1: z.string().optional(),
      addressLine2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
    })
    .optional(),
  departments: z
    .array(
      z.object({
        departmentId: z.string().optional(),
        name: z.string().optional(),
      }),
    )
    .default([]),
});

export const krogerLocationsResponseSchema = z.object({
  data: z.array(krogerLocationSchema).default([]),
});

export const krogerTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().positive().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

export type KrogerLocation = z.infer<typeof krogerLocationSchema>;
export type KrogerProduct = z.infer<typeof krogerProductSchema>;
export type KrogerTokenResponse = z.infer<typeof krogerTokenResponseSchema>;
