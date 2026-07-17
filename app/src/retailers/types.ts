import type {
  FulfillmentMode,
  GroceryNeed,
  Product,
  ProductCandidate,
  Store,
  UserPreferences,
} from "@/domain/grocery";

export type RetailerId = "kroger";

export type RetailerLocation = Store & {
  retailer: NonNullable<Store["retailer"]>;
};

export type RetailerProductSearch = {
  products: Product[];
  candidateGroup: {
    need: GroceryNeed;
    candidates: ProductCandidate[];
    allCandidates: ProductCandidate[];
  };
  retrievedAt: string;
};

export type RetailerCartItem = {
  quantity: number;
  upc: string;
  fulfillmentMode: FulfillmentMode;
};

export interface RetailerConnector {
  readonly id: RetailerId;
  listLocations(zipCode: string): Promise<RetailerLocation[]>;
  searchNeed(
    need: GroceryNeed,
    preferences: UserPreferences,
    location: RetailerLocation,
  ): Promise<RetailerProductSearch>;
  addToCart(accessToken: string, items: RetailerCartItem[]): Promise<void>;
}
