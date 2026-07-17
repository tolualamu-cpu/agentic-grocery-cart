import "server-only";

import type { GroceryNeed, Product, UserPreferences } from "@/domain/grocery";
import { buildOptimizedCartFromCandidates } from "@/pipeline/optimizer";
import { krogerConnector } from "@/retailers/kroger/client";

export async function buildKrogerCartPreview(
  needs: GroceryNeed[],
  preferences: UserPreferences,
  locationId: string,
) {
  const location = await krogerConnector.getLocation(locationId);
  const searches = await mapWithConcurrency(needs, 4, (need) =>
    krogerConnector.searchNeed(need, preferences, location),
  );
  const candidateGroups = searches.map((search) => search.candidateGroup);
  const products = deduplicateProducts(searches.flatMap((search) => search.products));
  const retrievedAt = searches[0]?.retrievedAt ?? new Date().toISOString();
  const cart = buildOptimizedCartFromCandidates(needs, preferences, candidateGroups);

  return { cart, products, retrievedAt, location };
}

async function mapWithConcurrency<TInput, TOutput>(
  inputs: TInput[],
  concurrency: number,
  task: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = new Array<TOutput>(inputs.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < inputs.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(inputs[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), inputs.length) }, () => worker()),
  );
  return results;
}

function deduplicateProducts(products: Product[]): Product[] {
  return Array.from(new Map(products.map((product) => [product.id, product])).values());
}
