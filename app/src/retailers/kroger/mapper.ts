import type {
  FulfillmentMode,
  GroceryNeed,
  Product,
  ProductCandidate,
  ProductImage,
  Store,
  UserPreferences,
} from "@/domain/grocery";
import { normalizeText } from "@/pipeline/search";
import type { RetailerLocation, RetailerProductSearch } from "@/retailers/types";
import type { KrogerLocation, KrogerProduct } from "@/retailers/kroger/contracts";

const outOfStockLevels = new Set(["OUT_OF_STOCK", "TEMPORARILY_OUT_OF_STOCK"]);
const krogerStoreBrands = new Set([
  "abound",
  "bakery fresh goodness",
  "comforts",
  "heritage farm",
  "home chef",
  "kroger",
  "private selection",
  "simple truth",
  "simple truth organic",
  "smart way",
]);

export function mapKrogerLocation(location: KrogerLocation): RetailerLocation {
  const address = formatAddress(location.address);

  return {
    id: `kroger:${location.locationId}`,
    name: location.name,
    fulfillment: ["pickup", "delivery"],
    pickupFee: 0,
    deliveryFee: 0,
    minimumOrder: 0,
    feesKnown: false,
    retailer: {
      connectorId: "kroger",
      locationId: location.locationId,
      chain: location.chain ?? "Kroger",
      address: address || undefined,
    },
  };
}

export function mapKrogerProductsForNeed({
  products,
  need,
  preferences,
  location,
  retrievedAt,
}: {
  products: KrogerProduct[];
  need: GroceryNeed;
  preferences: UserPreferences;
  location: RetailerLocation;
  retrievedAt: string;
}): RetailerProductSearch {
  const mappedProducts = products.map((product) => mapKrogerProduct(product, need));
  const allCandidates = products.flatMap((product) =>
    mapKrogerCandidates(product, need, preferences, location, retrievedAt),
  );
  const candidates = allCandidates
    .filter((candidate) => candidate.offer.available)
    .filter((candidate) => candidate.store.fulfillment.includes(preferences.fulfillmentMode))
    .sort((a, b) => sortCandidates(a, b, preferences));

  return {
    products: mappedProducts,
    candidateGroup: {
      need,
      candidates,
      allCandidates,
    },
    retrievedAt,
  };
}

function mapKrogerProduct(product: KrogerProduct, need: GroceryNeed): Product {
  return {
    id: `kroger-product:${product.productId}`,
    canonicalName: product.description,
    category: product.categories[0] ?? need.category,
    subcategory: product.categories[1],
    tags: uniqueStrings([product.brand ?? "", ...product.categories].filter(Boolean).map(normalizeText)),
    aliases: [product.description],
    image: selectKrogerImage(product, need),
  };
}

function mapKrogerCandidates(
  product: KrogerProduct,
  need: GroceryNeed,
  preferences: UserPreferences,
  location: RetailerLocation,
  retrievedAt: string,
): ProductCandidate[] {
  if (!matchesHardConstraints(product, need, preferences)) {
    return [];
  }

  return product.items.flatMap((item) => {
    const price = selectPrice(item.price);

    if (price === null) {
      return [];
    }

    const fulfillment = {
      pickup: item.fulfillment?.curbside === true,
      delivery: item.fulfillment?.delivery === true,
    };
    const fulfillmentModes: FulfillmentMode[] = [
      ...(fulfillment.pickup ? (["pickup"] as const) : []),
      ...(fulfillment.delivery ? (["delivery"] as const) : []),
    ];
    const candidateStore: Store = {
      ...location,
      fulfillment: fulfillmentModes,
    };
    const packageSize = parsePackageSize(item.size);
    const match = scoreMatch(product, need, preferences, packageSize);
    const stockLevel = item.inventory?.stockLevel;
    const available = !stockLevel || !outOfStockLevels.has(stockLevel.toUpperCase());
    const brand = product.brand?.trim() || "Kroger catalog";
    const image = selectKrogerImage(product, need);

    return [
      {
        needId: need.id,
        offer: {
          id: `kroger-offer:${location.retailer.locationId}:${product.productId}:${item.itemId}`,
          productId: `kroger-product:${product.productId}`,
          storeId: location.id,
          name: product.description,
          brand,
          packageQuantity: packageSize.quantity,
          packageUnit: packageSize.unit,
          price,
          available,
          organic: /\borganic\b/i.test(`${product.description} ${brand}`),
          storeBrand: krogerStoreBrands.has(normalizeText(brand)),
          dietaryTags: inferExplicitDietaryTags(product),
          image,
          retailer: {
            connectorId: "kroger",
            productId: product.productId,
            itemId: item.itemId,
            upc: product.upc,
            locationId: location.retailer.locationId,
            productUrl: `https://www.kroger.com/search?query=${encodeURIComponent(product.upc)}`,
            fetchedAt: retrievedAt,
            inventoryLevel: stockLevel,
            fulfillment,
            dimensions: product.itemInformation,
            countryOrigin: product.countryOrigin,
            temperature: product.temperature,
          },
        },
        store: candidateStore,
        matchScore: match.score,
        quantityCoverage:
          packageSize.unit === need.unit
            ? packageSize.quantity / Math.max(need.quantity, 1)
            : 1,
        unitPrice: price / Math.max(packageSize.quantity, 1),
        reasons: match.reasons,
        warnings: [
          ...match.warnings,
          ...(available ? [] : ["Kroger currently reports this item out of stock."]),
        ],
      },
    ];
  });
}

function matchesHardConstraints(
  product: KrogerProduct,
  need: GroceryNeed,
  preferences: UserPreferences,
): boolean {
  const searchable = normalizeText(
    [product.description, product.brand, ...product.categories].filter(Boolean).join(" "),
  );
  const isOrganic = /\borganic\b/.test(searchable);

  if ((need.constraints.organic === true || preferences.organicPreference === "required") && !isOrganic) {
    return false;
  }

  if (need.constraints.organic === false && isOrganic) {
    return false;
  }

  const preferredBrands = need.constraints.brandPreference ?? [];

  if (
    preferredBrands.length > 0 &&
    !preferredBrands.some((brand) => normalizeText(product.brand ?? "").includes(normalizeText(brand)))
  ) {
    return false;
  }

  return (need.constraints.dietaryTags ?? []).every((tag) => {
    const normalizedTag = normalizeText(tag);
    return searchable.includes(normalizedTag) || searchable.includes(normalizedTag.replace(" ", "-"));
  });
}

function scoreMatch(
  product: KrogerProduct,
  need: GroceryNeed,
  preferences: UserPreferences,
  packageSize: { quantity: number; unit: string },
): { score: number; reasons: string[]; warnings: string[] } {
  const description = normalizeText(product.description);
  const needName = normalizeText(need.canonicalName);
  const needTokens = needName.split(" ").filter((token) => token.length > 1);
  const matchingTokenCount = needTokens.filter((token) => description.includes(token)).length;
  let score = description.includes(needName) ? 92 : 68 + matchingTokenCount * 7;
  const reasons = ["Matched against Kroger's location-specific product catalog."];
  const warnings: string[] = [];

  if (packageSize.unit === need.unit) {
    score += 4;
    reasons.push("Package unit matches the requested quantity.");
  } else {
    warnings.push(`Kroger lists the package as ${packageSize.quantity} ${packageSize.unit}.`);
  }

  const isOrganic = /\borganic\b/i.test(`${product.description} ${product.brand ?? ""}`);

  if (isOrganic && preferences.organicPreference === "prefer") {
    score += 4;
    reasons.push("Organic option matches the preference.");
  }

  if (!isOrganic && preferences.organicPreference === "prefer") {
    warnings.push("Not labeled organic in Kroger's product name.");
  }

  if (need.confidence < 0.75) {
    warnings.push("Need was inferred with lower confidence.");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons, warnings };
}

export function parsePackageSize(size?: string): { quantity: number; unit: string } {
  const normalized = (size ?? "").trim().toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|lb|ct|gal|qt|pt|ml|l|kg|g)\b/);

  if (!match) {
    return { quantity: 1, unit: "ct" };
  }

  return {
    quantity: Number(match[1]),
    unit: match[2].replace(/\s+/g, " "),
  };
}

function selectPrice(price?: { regular?: number; promo?: number }): number | null {
  if (price?.promo && price.promo > 0) {
    return price.promo;
  }

  if (price?.regular && price.regular > 0) {
    return price.regular;
  }

  return null;
}

function selectKrogerImage(product: KrogerProduct, need: GroceryNeed): ProductImage {
  const imageGroups = [...product.images].sort(
    (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)),
  );
  const sizes = imageGroups.flatMap((image) => image.sizes);
  const sizePriority = ["xlarge", "large", "medium", "small", "thumbnail"];
  const selected =
    sizePriority
      .map((size) => sizes.find((candidate) => candidate.size?.toLowerCase() === size))
      .find(Boolean) ?? sizes[0];

  return selected
    ? {
        src: selected.url,
        alt: `${product.description} product image`,
        background: "#ffffff",
      }
    : {
        src: `/catalog/products/fallback-${need.category.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "grocery"}.webp`,
        alt: `${product.description} grocery item`,
        background: "#f3f7f4",
      };
}

function inferExplicitDietaryTags(product: KrogerProduct): string[] {
  const text = normalizeText([product.description, ...product.categories].join(" "));
  const tags: string[] = [];

  for (const [tag, phrase] of [
    ["dairy-free", "dairy free"],
    ["gluten-free", "gluten free"],
    ["vegan", "vegan"],
    ["vegetarian", "vegetarian"],
  ] as const) {
    if (text.includes(phrase)) {
      tags.push(tag);
    }
  }

  return tags;
}

function sortCandidates(
  a: ProductCandidate,
  b: ProductCandidate,
  preferences: UserPreferences,
): number {
  if (preferences.optimizationGoal === "cheapest") {
    return a.offer.price - b.offer.price || b.matchScore - a.matchScore;
  }

  return b.matchScore - a.matchScore || a.offer.price - b.offer.price;
}

function formatAddress(address?: KrogerLocation["address"]): string {
  if (!address) {
    return "";
  }

  return [
    address.addressLine1,
    address.addressLine2,
    [address.city, address.state].filter(Boolean).join(", "),
    address.zipCode,
  ]
    .filter(Boolean)
    .join(" ");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
