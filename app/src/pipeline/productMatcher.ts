import { offers, products, stores } from "@/data/mockCatalog";
import type { GroceryNeed, Offer, Product, ProductCandidate, ProductMatcher, UserPreferences } from "@/domain/grocery";
import { interpretGroceryIntentSync } from "@/pipeline/groceryIntent";
import { deterministicSearchService, normalizeText, type SearchDocument } from "@/pipeline/search";

const unitAliases: Record<string, string[]> = {
  pack: ["ct"],
  bottle: ["fl oz"],
  bag: ["lb", "oz"],
  loaf: ["oz"],
  jar: ["oz"],
  carton: ["fl oz"],
  tub: ["oz"],
  bulb: ["ct"],
  bunch: ["ct"],
  box: ["oz"],
  wedge: ["oz"],
  can: ["fl oz"],
};

export class CatalogProductMatcher implements ProductMatcher {
  findCandidates(need: GroceryNeed, preferences: UserPreferences): ProductCandidate[] {
    const productMatches = findProductMatches(need);

    return offers
      .filter((offer) => productMatches.some((match) => match.product.id === offer.productId))
      .filter((offer) => {
        if (need.constraints.organic === true) {
          return Boolean(offer.organic);
        }

        if (need.constraints.organic === false) {
          return !offer.organic;
        }

        return true;
      })
      .filter((offer) => {
        const dietaryTags = need.constraints.dietaryTags ?? [];

        if (dietaryTags.length === 0) {
          return true;
        }

        return dietaryTags.every((tag) => {
          if (tag === "dairy-free" && !isDairyRelevantOffer(need, offer, productMatches)) {
            return true;
          }

          return offer.dietaryTags?.includes(tag);
        });
      })
      .map((offer) => {
        const match = productMatches.find((item) => item.product.id === offer.productId);

        return scoreOffer(need, offer, preferences, match?.semanticScore ?? 0, match?.matchReason ?? "Catalog match");
      })
      .filter((candidate) => candidate.offer.available)
      .filter((candidate) => {
        if (preferences.organicPreference !== "required") {
          return true;
        }

        return Boolean(candidate.offer.organic);
      })
      .sort((a, b) => candidateSort(a, b, preferences));
  }
}

function isDairyRelevantOffer(
  need: GroceryNeed,
  offer: Offer,
  productMatches: Array<{ product: Product }>,
): boolean {
  const product = productMatches.find((match) => match.product.id === offer.productId)?.product;
  const searchableText = [
    need.category,
    need.canonicalName,
    product?.category,
    product?.canonicalName,
    ...(product?.tags ?? []),
    offer.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\bdairy\b|\bmilk\b|\byogurt\b|\bcheese\b|\branch\b|\bdressing\b/.test(searchableText);
}

export const catalogProductMatcher = new CatalogProductMatcher();

export function searchCatalogProducts(query: string, limit = 8): Product[] {
  const intent = interpretGroceryIntentSync(query, { surface: "add_item" });
  const candidates = deterministicSearchService
    .search(intent.coreQuery, productDocuments(), {
      surface: "add_item",
      limit: Math.max(limit, 12),
    })
    .map((candidate) => candidate.document.payload);
  const dietaryTags = intent.constraints.dietaryTags;

  if (dietaryTags.length > 0) {
    const matchingDietaryProducts = candidates.filter((product) =>
      dietaryTags.every((tag) => product.tags.includes(tag) || product.dietaryTags?.includes(tag)),
    );

    if (matchingDietaryProducts.length > 0) {
      return matchingDietaryProducts.slice(0, limit);
    }
  }

  return candidates.slice(0, limit);
}

function findProductMatches(need: GroceryNeed): Array<{ product: Product; semanticScore: number; matchReason: string }> {
  const normalizedNeed = normalizeText(need.canonicalName);
  const exactProducts = products.filter((product) => isExactProduct(product, normalizedNeed));

  if (exactProducts.length > 0) {
    return exactProducts.map((product) => ({
      product,
      semanticScore: 50,
      matchReason: "Exact canonical or alias match.",
    }));
  }

  const queryTokenCount = normalizedNeed.split(" ").filter(Boolean).length;
  const candidates = deterministicSearchService
    .search(need.canonicalName, productDocuments(), {
      surface: "product_matching",
      limit: 12,
    })
    .filter((candidate) => {
      const matchedEnoughTerms =
        candidate.matchedTerms.includes(normalizedNeed) || candidate.matchedTerms.length >= queryTokenCount;

      return candidate.score >= 72 && matchedEnoughTerms && (candidate.document.category === need.category || candidate.score >= 84);
    });
  const exactCandidates = candidates.filter((candidate) => isExactProductMatch(candidate.document, normalizedNeed));
  const finalCandidates =
    need.constraints.substitutionPolicy === "strict"
      ? exactCandidates
      : exactCandidates.length > 0
        ? exactCandidates
        : candidates;

  return finalCandidates
    .map((candidate) => ({
      product: candidate.document.payload,
      semanticScore: Math.round(candidate.score / 2),
      matchReason: candidate.reasons[0] ?? "Catalog search match.",
    }));
}

function scoreOffer(
  need: GroceryNeed,
  offer: Offer,
  preferences: UserPreferences,
  semanticScore: number,
  matchReason: string,
): ProductCandidate {
  const store = stores.find((item) => item.id === offer.storeId);

  if (!store) {
    throw new Error(`Missing store for offer ${offer.id}`);
  }

  const compatibleUnit = offer.packageUnit === need.unit || unitAliases[need.unit]?.includes(offer.packageUnit);
  const quantityCoverage = compatibleUnit ? offer.packageQuantity / Math.max(need.quantity, 1) : 1;
  let matchScore = Math.min(92, 45 + semanticScore);
  const reasons = [matchReason];
  const warnings: string[] = [];

  if (compatibleUnit) {
    matchScore += 6;
    reasons.push("Package size is compatible with the need.");
  } else {
    matchScore -= 8;
    warnings.push(`Package unit is ${offer.packageUnit}, while the need is ${need.unit}.`);
  }

  if (quantityCoverage >= 1) {
    matchScore += 4;
    reasons.push("Package covers the requested quantity.");
  }

  if (offer.storeBrand && preferences.brandFlexibility === "flexible") {
    matchScore += 5;
    reasons.push("Store brand keeps the cart value-focused.");
  }

  if (offer.storeBrand && preferences.brandFlexibility === "balanced") {
    matchScore += 1;
    reasons.push("Store brand is acceptable under balanced brand flexibility.");
  }

  if (offer.storeBrand && preferences.brandFlexibility === "strict") {
    matchScore -= 8;
    warnings.push("Store-brand item conflicts with strict brand flexibility.");
  }

  if (offer.organic && (preferences.organicPreference === "prefer" || preferences.organicPreference === "required")) {
    matchScore += 8;
    reasons.push("Organic option matches the preference.");
  }

  if (!offer.organic && preferences.organicPreference === "prefer") {
    matchScore -= 4;
    warnings.push("Not organic, but lower cost may fit the optimization goal.");
  }

  if (offer.organic && preferences.organicPreference === "prefer_non_organic") {
    matchScore -= 6;
    warnings.push("Organic item is available, but the current preference leans non-organic.");
  }

  if (!offer.organic && preferences.organicPreference === "prefer_non_organic") {
    matchScore += 5;
    reasons.push("Non-organic option matches the preference.");
  }

  if (!store.fulfillment.includes(preferences.fulfillmentMode)) {
    matchScore -= 20;
    warnings.push(`${store.name} does not support ${preferences.fulfillmentMode} for this mock location.`);
  }

  if (need.confidence < 0.75) {
    warnings.push("Need was inferred with lower confidence.");
  }

  return {
    needId: need.id,
    offer,
    store,
    matchScore: Math.max(0, Math.min(100, matchScore)),
    quantityCoverage,
    unitPrice: offer.price / Math.max(offer.packageQuantity, 1),
    reasons,
    warnings,
  };
}

function candidateSort(
  a: ProductCandidate,
  b: ProductCandidate,
  preferences: UserPreferences,
): number {
  if (preferences.optimizationGoal === "cheapest") {
    return a.offer.price - b.offer.price || b.matchScore - a.matchScore;
  }

  if (preferences.optimizationGoal === "fewest_stores") {
    return (a.store.distanceMiles ?? Number.MAX_SAFE_INTEGER) -
        (b.store.distanceMiles ?? Number.MAX_SAFE_INTEGER) ||
      a.offer.price - b.offer.price;
  }

  if (preferences.optimizationGoal === "preferred_brands") {
    return Number(a.offer.storeBrand) - Number(b.offer.storeBrand) || b.matchScore - a.matchScore;
  }

  return b.matchScore - a.matchScore || organicPreferenceSort(a, b, preferences) || a.offer.price - b.offer.price;
}

function organicPreferenceSort(
  a: ProductCandidate,
  b: ProductCandidate,
  preferences: UserPreferences,
): number {
  if (preferences.organicPreference === "prefer" || preferences.organicPreference === "required") {
    return Number(Boolean(b.offer.organic)) - Number(Boolean(a.offer.organic));
  }

  if (preferences.organicPreference === "prefer_non_organic") {
    return Number(Boolean(a.offer.organic)) - Number(Boolean(b.offer.organic));
  }

  return 0;
}

function productDocuments(): Array<SearchDocument<Product>> {
  return productSearchDocuments;
}

const productSearchDocuments: Array<SearchDocument<Product>> = products.map((product, index) => ({
    id: product.id,
    type: "product",
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
  }));

function isExactProductMatch(document: SearchDocument<Product>, normalizedNeed: string): boolean {
  return [document.canonicalName, document.displayName, ...document.aliases]
    .map(normalizeText)
    .some((name) => name === normalizedNeed);
}

function isExactProduct(product: Product, normalizedNeed: string): boolean {
  return [product.canonicalName, ...(product.aliases ?? [])].map(normalizeText).some((name) => name === normalizedNeed);
}
