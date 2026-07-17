export type GroceryNeedSource = "recipe" | "manual_list" | "past_cart" | "meal_plan";

export type SubstitutionPolicy = "strict" | "similar" | "flexible";

export type FulfillmentMode = "pickup" | "delivery";

export type OptimizationGoal =
  | "cheapest"
  | "best_value"
  | "fewest_stores"
  | "preferred_brands";

export type GroceryNeed = {
  id: string;
  canonicalName: string;
  displayName: string;
  category: string;
  quantity: number;
  unit: string;
  source: GroceryNeedSource;
  confidence: number;
  constraints: {
    organic?: boolean;
    brandPreference?: string[];
    dietaryTags?: string[];
    substitutionPolicy: SubstitutionPolicy;
    maxPrice?: number;
  };
};

export type GroceryInferenceResult = {
  needs: GroceryNeed[];
  clarifyingQuestion?: string;
  warnings: string[];
};

export type Store = {
  id: string;
  name: string;
  distanceMiles?: number;
  fulfillment: FulfillmentMode[];
  pickupFee: number;
  deliveryFee: number;
  minimumOrder: number;
  feesKnown?: boolean;
  retailer?: {
    connectorId: string;
    locationId: string;
    chain: string;
    address?: string;
  };
};

export type ProductImage = {
  src: string;
  alt: string;
  background?: string;
};

export type Product = {
  id: string;
  canonicalName: string;
  category: string;
  subcategory?: string;
  tags: string[];
  semanticTags?: string[];
  dietaryTags?: string[];
  aliases?: string[];
  image: ProductImage;
};

export type Offer = {
  id: string;
  productId: string;
  storeId: string;
  name: string;
  brand: string;
  packageQuantity: number;
  packageUnit: string;
  price: number;
  available: boolean;
  organic?: boolean;
  storeBrand?: boolean;
  dietaryTags?: string[];
  image?: ProductImage;
  retailer?: {
    connectorId: string;
    productId: string;
    itemId: string;
    upc: string;
    locationId: string;
    productUrl: string;
    fetchedAt: string;
    inventoryLevel?: string;
    fulfillment: {
      pickup: boolean;
      delivery: boolean;
    };
    dimensions?: {
      height?: string;
      width?: string;
      depth?: string;
    };
    countryOrigin?: string;
    temperature?: {
      indicator?: string;
      heatSensitive?: boolean;
    };
  };
};

export type ProductCandidate = {
  needId: string;
  offer: Offer;
  store: Store;
  matchScore: number;
  quantityCoverage: number;
  unitPrice: number;
  reasons: string[];
  warnings: string[];
};

export type OptimizedCartStatus = "ready" | "needs_review" | "blocked";

export type UnmatchedNeedReason =
  | "no_candidate"
  | "constraint_conflict"
  | "fulfillment_unavailable"
  | "max_stores_conflict"
  | "out_of_stock";

export type UnmatchedNeedAction =
  | "relax_constraint"
  | "remove_item"
  | "search_manually"
  | "increase_max_stores";

export type UnmatchedNeed = {
  need: GroceryNeed;
  reason: UnmatchedNeedReason;
  blockingConstraints: string[];
  suggestedActions: UnmatchedNeedAction[];
};

export type OptimizationScoreBreakdown = {
  costFit: number;
  storeFit: number;
  matchFit: number;
  packageFit: number;
  organicFit: number;
  brandFit: number;
  budgetFit: number;
  weightedScore: number;
};

export type UserPreferences = {
  optimizationGoal: OptimizationGoal;
  maxStores: number;
  fulfillmentMode: FulfillmentMode;
  organicPreference: "prefer" | "prefer_non_organic" | "required" | "none";
  brandFlexibility: "strict" | "balanced" | "flexible";
  budgetTarget: number;
};

export type CartItem = {
  need: GroceryNeed;
  selected: ProductCandidate;
  alternatives: ProductCandidate[];
};

export type CartPlanOption = {
  id: string;
  title: string;
  badge: string;
  strategy: OptimizationGoal;
  items: CartItem[];
  stores: Store[];
  subtotal: number;
  fees: number;
  total: number;
  savingsEstimate: number;
  warnings: string[];
  explanations: string[];
  comparisonSummary: string;
  tradeoffs: string[];
  isRecommended: boolean;
  scoreBreakdown: OptimizationScoreBreakdown;
  unmatchedNeeds: UnmatchedNeed[];
  status: OptimizedCartStatus;
};

export type OptimizedCart = {
  items: CartItem[];
  stores: Store[];
  subtotal: number;
  fees: number;
  total: number;
  savingsEstimate: number;
  warnings: string[];
  explanations: string[];
  activePlanId: string;
  planOptions: CartPlanOption[];
  scoreBreakdown: OptimizationScoreBreakdown;
  unmatchedNeeds: UnmatchedNeed[];
  status: OptimizedCartStatus;
};

export type NeedGenerationContext = UserPreferences & {
  source: GroceryNeedSource;
};

export interface NeedGenerator {
  generate(input: string, context: NeedGenerationContext): Promise<GroceryInferenceResult>;
}

export interface ProductMatcher {
  findCandidates(need: GroceryNeed, preferences: UserPreferences): ProductCandidate[];
}
