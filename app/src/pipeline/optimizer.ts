import { offers, products, stores } from "@/data/mockCatalog";
import type {
  CartItem,
  CartPlanOption,
  GroceryNeed,
  OptimizationScoreBreakdown,
  OptimizationGoal,
  OptimizedCart,
  ProductCandidate,
  Store,
  UnmatchedNeed,
  UserPreferences,
} from "@/domain/grocery";
import { catalogProductMatcher } from "@/pipeline/productMatcher";
import { getLineTotal } from "@/pipeline/pricing";
import { normalizeText } from "@/pipeline/search";

type CandidateGroup = {
  need: GroceryNeed;
  candidates: ProductCandidate[];
  allCandidates: ProductCandidate[];
};

type CartPlan = {
  items: CartItem[];
  stores: Store[];
  subtotal: number;
  fees: number;
  total: number;
  score: number;
  averageMatchScore: number;
  averageQuantityCoverage: number;
  storeBrandCount: number;
  organicCount: number;
  warnings: string[];
  scoreBreakdown: OptimizationScoreBreakdown;
};

type PlanRecipe = {
  id: string;
  title: string;
  badge: string;
  strategy: OptimizationGoal;
  selector: (plans: CartPlan[]) => CartPlan | undefined;
};

const emptyScoreBreakdown: OptimizationScoreBreakdown = {
  costFit: 0,
  storeFit: 0,
  matchFit: 0,
  packageFit: 0,
  organicFit: 0,
  brandFit: 0,
  budgetFit: 0,
  weightedScore: 0,
};

const optimizerWeights: Record<OptimizationGoal, Omit<OptimizationScoreBreakdown, "weightedScore">> = {
  cheapest: {
    costFit: 65,
    storeFit: 10,
    matchFit: 8,
    packageFit: 5,
    organicFit: 4,
    brandFit: 3,
    budgetFit: 5,
  },
  best_value: {
    costFit: 20,
    storeFit: 4,
    matchFit: 20,
    packageFit: 10,
    organicFit: 12,
    brandFit: 10,
    budgetFit: 24,
  },
  fewest_stores: {
    costFit: 15,
    storeFit: 55,
    matchFit: 10,
    packageFit: 5,
    organicFit: 8,
    brandFit: 5,
    budgetFit: 2,
  },
  preferred_brands: {
    costFit: 12,
    storeFit: 5,
    matchFit: 15,
    packageFit: 10,
    organicFit: 15,
    brandFit: 40,
    budgetFit: 3,
  },
};

export function buildOptimizedCart(
  needs: GroceryNeed[],
  preferences: UserPreferences,
): OptimizedCart {
  const warnings: string[] = [];
  const candidateGroups = needs.map((need) => {
    const allCandidates = catalogProductMatcher.findCandidates(need, preferences);

    return {
      need,
      allCandidates,
      candidates: allCandidates.filter((candidate) => candidate.store.fulfillment.includes(preferences.fulfillmentMode)),
    };
  });
  let unmatchedNeeds = candidateGroups
    .filter((group) => group.candidates.length === 0)
    .map((group) => buildUnmatchedNeed(group.need, preferences, group.allCandidates));

  for (const unmatchedNeed of unmatchedNeeds) {
    warnings.push(`No available product matched ${unmatchedNeed.need.displayName}.`);

    if (unmatchedNeed.reason === "fulfillment_unavailable") {
      warnings.push(`No ${preferences.fulfillmentMode} option matched ${unmatchedNeed.need.displayName}.`);
    } else if (unmatchedNeed.reason === "constraint_conflict") {
      warnings.push(`No product matched ${unmatchedNeed.need.displayName} with the required constraints.`);
    }
  }

  const matchedGroups = candidateGroups.filter((group) => group.candidates.length > 0);
  const cheapestPossible = buildCheapestPossibleSubtotal(matchedGroups);
  const planOptions = buildCartPlanOptions(matchedGroups, preferences, cheapestPossible, unmatchedNeeds);

  if (matchedGroups.length > 0 && planOptions.length === 0) {
    unmatchedNeeds = needs.map((need) => ({
      need,
      reason: "max_stores_conflict",
      blockingConstraints: [`max stores: ${preferences.maxStores}`],
      suggestedActions: ["increase_max_stores", "remove_item"],
    }));
    warnings.push("No complete cart fit the current max-store setting.");
  }

  const selectedPlanOption = planOptions.find((plan) => plan.isRecommended) ?? planOptions[0];
  const selectedPlan = selectedPlanOption ?? cartPlanOptionFromPlan({
    plan: emptyPlan(),
    id: "empty",
    title: "Empty cart",
    badge: "No matches",
    strategy: preferences.optimizationGoal,
    preferences,
    cheapestPlan: emptyPlan(),
    cheapestPossible,
    isRecommended: true,
    unmatchedNeeds,
  });
  const status = getCartStatus(selectedPlan.items.length, needs.length, unmatchedNeeds);

  warnings.push(...selectedPlan.warnings);

  return {
    items: selectedPlan.items,
    stores: selectedPlan.stores,
    subtotal: selectedPlan.subtotal,
    fees: selectedPlan.fees,
    total: selectedPlan.total,
    savingsEstimate: selectedPlan.savingsEstimate,
    warnings,
    explanations: selectedPlan.explanations,
    activePlanId: selectedPlan.id,
    planOptions,
    scoreBreakdown: selectedPlan.scoreBreakdown,
    unmatchedNeeds,
    status,
  };
}

function buildCartPlanOptions(
  candidateGroups: CandidateGroup[],
  preferences: UserPreferences,
  cheapestPossible: number,
  unmatchedNeeds: UnmatchedNeed[],
): CartPlanOption[] {
  if (candidateGroups.length === 0) {
    return [];
  }

  const planRecipes: PlanRecipe[] = [
    {
      id: "recommended",
      title: "Recommended",
      badge: toPlanBadge(preferences.optimizationGoal),
      strategy: preferences.optimizationGoal,
      selector: (plans) => plans[0],
    },
    {
      id: "cheapest-one-store",
      title: "Cheapest one-store",
      badge: "Simple",
      strategy: "cheapest",
      selector: (plans) => sortPlans(plans.filter((plan) => plan.stores.length === 1), "total")[0],
    },
    {
      id: "cheapest-split",
      title: "Cheapest split",
      badge: "Lowest total",
      strategy: "cheapest",
      selector: (plans) => sortPlans(plans.filter((plan) => plan.stores.length > 1), "total")[0],
    },
    {
      id: "fewest-stores",
      title: "Fewest stores",
      badge: "Convenient",
      strategy: "fewest_stores",
      selector: (plans) => sortPlans(plans, "fewest_stores")[0],
    },
    {
      id: "best-value",
      title: "Best value",
      badge: "Balanced",
      strategy: "best_value",
      selector: (plans) => plans[0],
    },
    {
      id: "preferred-brands",
      title: "Preferred brands",
      badge: "Brand fit",
      strategy: "preferred_brands",
      selector: (plans) => plans[0],
    },
  ];
  const plansByStrategy = new Map<OptimizationGoal, CartPlan[]>();

  for (const recipe of planRecipes) {
    if (!plansByStrategy.has(recipe.strategy)) {
      plansByStrategy.set(
        recipe.strategy,
        buildCartPlans(candidateGroups, {
          ...preferences,
          optimizationGoal: recipe.strategy,
        }),
      );
    }
  }

  const cheapestPlan =
    sortPlans(Array.from(plansByStrategy.values()).flat(), "total")[0] ?? emptyPlan();

  return planRecipes
    .map((recipe) => {
      const strategyPlans = plansByStrategy.get(recipe.strategy) ?? [];
      const plan = recipe.selector(strategyPlans);

      if (!plan) {
        return null;
      }

      return cartPlanOptionFromPlan({
        plan,
        id: recipe.id,
        title: recipe.title,
        badge: recipe.badge,
        strategy: recipe.strategy,
        preferences: {
          ...preferences,
          optimizationGoal: recipe.strategy,
        },
        cheapestPlan,
        cheapestPossible,
        isRecommended: recipe.id === "recommended",
        unmatchedNeeds,
      });
    })
    .filter((plan): plan is CartPlanOption => Boolean(plan));
}

function sortPlans(plans: CartPlan[], mode: "total" | "fewest_stores"): CartPlan[] {
  if (mode === "fewest_stores") {
    return [...plans].sort((a, b) => a.stores.length - b.stores.length || a.total - b.total || a.score - b.score);
  }

  return [...plans].sort((a, b) => a.total - b.total || a.stores.length - b.stores.length || a.score - b.score);
}

function toPlanBadge(strategy: OptimizationGoal): string {
  if (strategy === "best_value") {
    return "Recommended value";
  }

  if (strategy === "fewest_stores") {
    return "Recommended convenience";
  }

  if (strategy === "preferred_brands") {
    return "Recommended brands";
  }

  return "Recommended price";
}

function buildBudgetWarnings(plan: CartPlan, preferences: UserPreferences): string[] {
  if (preferences.budgetTarget > 0 && plan.total > preferences.budgetTarget) {
    return [`This cart is $${(plan.total - preferences.budgetTarget).toFixed(2)} over the budget target.`];
  }

  return [];
}

function buildComparisonSummary(plan: CartPlan, cheapestPlan: CartPlan): string {
  const totalDelta = plan.total - cheapestPlan.total;

  if (Math.abs(totalDelta) < 0.01) {
    return "Lowest cost option";
  }

  return `+$${totalDelta.toFixed(2)} vs lowest cost`;
}

function buildTradeoffs(plan: CartPlan, cheapestPlan: CartPlan, preferences: UserPreferences): string[] {
  const tradeoffs: string[] = [];
  const totalDelta = plan.total - cheapestPlan.total;

  if (Math.abs(totalDelta) < 0.01) {
    tradeoffs.push("Matches the lowest estimated total.");
  } else {
    tradeoffs.push(`Costs $${totalDelta.toFixed(2)} more than the lowest estimated plan.`);
  }

  if (plan.stores.length === 1) {
    tradeoffs.push(`Uses 1 store: ${plan.stores[0]?.name ?? "selected store"}.`);
  } else {
    tradeoffs.push(`Splits items across ${plan.stores.length} stores.`);
  }

  if (preferences.budgetTarget > 0) {
    if (plan.total > preferences.budgetTarget) {
      tradeoffs.push(`Runs $${(plan.total - preferences.budgetTarget).toFixed(2)} over the soft budget target.`);
    } else {
      tradeoffs.push(`Stays $${(preferences.budgetTarget - plan.total).toFixed(2)} under the soft budget target.`);
    }
  }

  if (preferences.organicPreference === "required") {
    tradeoffs.push(`${plan.organicCount} organic item${plan.organicCount === 1 ? "" : "s"} selected to satisfy the hard organic requirement.`);
  } else if (preferences.organicPreference === "prefer" && plan.organicCount > 0) {
    tradeoffs.push(`${plan.organicCount} organic item${plan.organicCount === 1 ? "" : "s"} included where value allowed.`);
  } else if (preferences.organicPreference === "prefer_non_organic") {
    tradeoffs.push(`${plan.items.length - plan.organicCount} non-organic item${plan.items.length - plan.organicCount === 1 ? "" : "s"} selected where value allowed.`);
  }

  if (preferences.brandFlexibility === "strict" && plan.storeBrandCount > 0) {
    tradeoffs.push(`${plan.storeBrandCount} store-brand item${plan.storeBrandCount === 1 ? "" : "s"} may need review under strict brand flexibility.`);
  } else if (plan.storeBrandCount > 0) {
    tradeoffs.push(`${plan.storeBrandCount} store-brand item${plan.storeBrandCount === 1 ? "" : "s"} help keep cost down.`);
  }

  return tradeoffs;
}

function cartPlanOptionFromPlan({
  plan,
  id,
  title,
  badge,
  strategy,
  preferences,
  cheapestPlan,
  cheapestPossible,
  isRecommended,
  unmatchedNeeds,
}: {
  plan: CartPlan;
  id: string;
  title: string;
  badge: string;
  strategy: OptimizationGoal;
  preferences: UserPreferences;
  cheapestPlan: CartPlan;
  cheapestPossible: number;
  isRecommended: boolean;
  unmatchedNeeds: UnmatchedNeed[];
}): CartPlanOption {
  const warnings = [...plan.warnings, ...buildBudgetWarnings(plan, preferences)];
  const status = getCartStatus(plan.items.length, plan.items.length + unmatchedNeeds.length, unmatchedNeeds);

  return {
    id,
    title,
    badge,
    strategy,
    items: plan.items,
    stores: plan.stores,
    subtotal: plan.subtotal,
    fees: plan.fees,
    total: plan.total,
    savingsEstimate: Math.max(0, plan.total - cheapestPossible),
    warnings,
    explanations: buildExplanations(plan, preferences),
    comparisonSummary: buildComparisonSummary(plan, cheapestPlan),
    tradeoffs: buildTradeoffs(plan, cheapestPlan, preferences),
    isRecommended,
    scoreBreakdown: plan.scoreBreakdown,
    unmatchedNeeds,
    status,
  };
}

function buildCartPlans(candidateGroups: CandidateGroup[], preferences: UserPreferences): CartPlan[] {
  if (candidateGroups.length === 0) {
    return [];
  }

  const availableStoreIds = Array.from(
    new Set(candidateGroups.flatMap((group) => group.candidates.map((candidate) => candidate.store.id))),
  );
  const storeSubsets = buildStoreSubsets(availableStoreIds, Math.max(1, preferences.maxStores));

  return storeSubsets
    .map((storeSubset) => buildPlanForStoreSubset(candidateGroups, storeSubset, preferences))
    .filter((plan): plan is CartPlan => Boolean(plan))
    .sort((a, b) => sortBuiltPlans(a, b, preferences));
}

function sortBuiltPlans(a: CartPlan, b: CartPlan, preferences: UserPreferences): number {
  if (preferences.optimizationGoal === "cheapest") {
    return a.total - b.total || b.scoreBreakdown.weightedScore - a.scoreBreakdown.weightedScore;
  }

  if (preferences.optimizationGoal === "fewest_stores") {
    return a.stores.length - b.stores.length || a.total - b.total || b.scoreBreakdown.weightedScore - a.scoreBreakdown.weightedScore;
  }

  return b.scoreBreakdown.weightedScore - a.scoreBreakdown.weightedScore || a.total - b.total;
}

function buildPlanForStoreSubset(
  candidateGroups: CandidateGroup[],
  storeSubset: string[],
  preferences: UserPreferences,
): CartPlan | null {
  const selectedCandidates: ProductCandidate[] = [];

  for (const group of candidateGroups) {
    const candidatesInSubset = group.candidates.filter((candidate) => storeSubset.includes(candidate.store.id));

    if (candidatesInSubset.length === 0) {
      return null;
    }

    selectedCandidates.push(
      [...candidatesInSubset].sort((a, b) => scoreCandidateForPlan(group.need, a, preferences) - scoreCandidateForPlan(group.need, b, preferences))[0],
    );
  }

  return buildCartPlan(candidateGroups, selectedCandidates, preferences);
}

function scoreCandidateForPlan(
  need: GroceryNeed,
  candidate: ProductCandidate,
  preferences: UserPreferences,
): number {
  const lineTotal = getLineTotal(need, candidate);
  const matchPenalty = Math.max(0, 100 - candidate.matchScore);
  const coveragePenalty = Math.max(0, 1 - candidate.quantityCoverage) * 5;
  const organicCredit = preferences.organicPreference === "prefer" && candidate.offer.organic ? 6 : 0;
  const nonOrganicCredit =
    preferences.organicPreference === "prefer_non_organic" && !candidate.offer.organic ? 4 : 0;
  const storeBrandPenalty =
    preferences.optimizationGoal === "preferred_brands" || preferences.brandFlexibility === "strict"
      ? candidate.offer.storeBrand
        ? 8
        : -4
      : 0;

  if (preferences.optimizationGoal === "best_value") {
    return lineTotal + matchPenalty * 0.1 + coveragePenalty - organicCredit - nonOrganicCredit + storeBrandPenalty * 0.25;
  }

  if (preferences.optimizationGoal === "preferred_brands") {
    return lineTotal + matchPenalty * 0.08 + coveragePenalty + storeBrandPenalty - organicCredit - nonOrganicCredit;
  }

  return lineTotal + matchPenalty * 0.02 + coveragePenalty + Math.max(0, storeBrandPenalty) * 0.2 - nonOrganicCredit * 0.5;
}

function buildStoreSubsets(storeIds: string[], maxStores: number): string[][] {
  const subsets: string[][] = [];

  function visit(index: number, selectedStoreIds: string[]) {
    if (selectedStoreIds.length > 0 && selectedStoreIds.length <= maxStores) {
      subsets.push([...selectedStoreIds]);
    }

    if (selectedStoreIds.length === maxStores) {
      return;
    }

    for (let nextIndex = index; nextIndex < storeIds.length; nextIndex += 1) {
      visit(nextIndex + 1, [...selectedStoreIds, storeIds[nextIndex]]);
    }
  }

  visit(0, []);

  return subsets;
}

function buildCartPlan(
  candidateGroups: CandidateGroup[],
  selectedCandidates: ProductCandidate[],
  preferences: UserPreferences,
): CartPlan {
  const items = selectedCandidates.map((selected, index) => {
    const group = candidateGroups[index];

    return {
      need: group.need,
      selected,
      alternatives: group.candidates.filter((candidate) => candidate.offer.id !== selected.offer.id).slice(0, 3),
    };
  });
  const selectedStores = stores.filter((store) =>
    selectedCandidates.some((candidate) => candidate.store.id === store.id),
  );
  const subtotal = sum(items.map((item) => getLineTotal(item.need, item.selected)));
  const fees = sum(selectedStores.map((store) => getFulfillmentFee(store, preferences)));
  const total = subtotal + fees;
  const averageMatchScore = average(selectedCandidates.map((candidate) => candidate.matchScore));
  const averageQuantityCoverage = average(selectedCandidates.map((candidate) => Math.min(candidate.quantityCoverage, 1.5)));
  const storeBrandCount = selectedCandidates.filter((candidate) => candidate.offer.storeBrand).length;
  const organicCount = selectedCandidates.filter((candidate) => candidate.offer.organic).length;

  return {
    items,
    stores: selectedStores,
    subtotal,
    fees,
    total,
    averageMatchScore,
    averageQuantityCoverage,
    storeBrandCount,
    organicCount,
    warnings: selectedCandidates.flatMap((candidate) => candidate.warnings),
    score: scoreCartPlan({
      total,
      selectedStores,
      averageMatchScore,
      averageQuantityCoverage,
      storeBrandCount,
      organicCount,
      itemCount: selectedCandidates.length,
      preferences,
    }),
    scoreBreakdown: buildScoreBreakdown({
      total,
      selectedStores,
      averageMatchScore,
      averageQuantityCoverage,
      storeBrandCount,
      organicCount,
      itemCount: selectedCandidates.length,
      preferences,
    }),
  };
}

function scoreCartPlan({
  total,
  selectedStores,
  averageMatchScore,
  averageQuantityCoverage,
  storeBrandCount,
  organicCount,
  itemCount,
  preferences,
}: {
  total: number;
  selectedStores: Store[];
  averageMatchScore: number;
  averageQuantityCoverage: number;
  storeBrandCount: number;
  organicCount: number;
  itemCount: number;
  preferences: UserPreferences;
}): number {
  return 100 - buildScoreBreakdown({
    total,
    selectedStores,
    averageMatchScore,
    averageQuantityCoverage,
    storeBrandCount,
    organicCount,
    itemCount,
    preferences,
  }).weightedScore;
}

function buildCheapestPossibleSubtotal(candidateGroups: CandidateGroup[]): number {
  return sum(
    candidateGroups.map(({ need, candidates }) =>
      candidates.length === 0
        ? 0
        : Math.min(...candidates.map((candidate) => getLineTotal(need, candidate))),
    ),
  );
}

function buildExplanations(plan: CartPlan, preferences: UserPreferences): string[] {
  if (plan.items.length === 0) {
    return ["No items are currently in this cart."];
  }

  const storeNames = plan.stores.map((store) => store.name).join(", ");
  const explanations = [
    `Built a ${preferences.optimizationGoal.replace("_", " ")} cart across ${plan.stores.length} store${plan.stores.length === 1 ? "" : "s"}: ${storeNames}.`,
    `Estimated ${preferences.fulfillmentMode} total is $${plan.total.toFixed(2)} including $${plan.fees.toFixed(2)} in current mock fees.`,
  ];

  if (preferences.optimizationGoal === "fewest_stores") {
    explanations.push("Store count was weighted ahead of small item-price differences.");
  } else if (preferences.optimizationGoal === "best_value") {
    explanations.push("Best value balanced total cost, match quality, package fit, organic preference, and store count.");
  } else if (preferences.optimizationGoal === "preferred_brands") {
    explanations.push("Preferred brands reduced reliance on store-brand items when comparable options were available.");
  } else {
    explanations.push("Cheapest strategy minimized the full estimated cart total.");
  }

  if (plan.storeBrandCount > 0 && preferences.optimizationGoal !== "preferred_brands") {
    explanations.push(`${plan.storeBrandCount} item${plan.storeBrandCount === 1 ? "" : "s"} use store-brand offers to keep value high.`);
  }

  if (preferences.organicPreference === "prefer" && plan.organicCount > 0) {
    explanations.push(`${plan.organicCount} organic item${plan.organicCount === 1 ? "" : "s"} were selected where they fit the strategy.`);
  }

  if (preferences.organicPreference === "prefer_non_organic") {
    const nonOrganicCount = plan.items.length - plan.organicCount;
    explanations.push(`${nonOrganicCount} non-organic item${nonOrganicCount === 1 ? "" : "s"} were selected where they fit the strategy.`);
  }

  if (preferences.budgetTarget > 0) {
    if (plan.total > preferences.budgetTarget) {
      explanations.push(`Budget target is $${preferences.budgetTarget.toFixed(2)}; this plan is $${(plan.total - preferences.budgetTarget).toFixed(2)} over, so lower-cost plans were favored without blocking better-fit items.`);
    } else {
      explanations.push(`Budget target is $${preferences.budgetTarget.toFixed(2)}; this plan is $${(preferences.budgetTarget - plan.total).toFixed(2)} under.`);
    }
  }

  return explanations;
}

function emptyPlan(): CartPlan {
  return {
    items: [],
    stores: [],
    subtotal: 0,
    fees: 0,
    total: 0,
    score: 0,
    averageMatchScore: 0,
    averageQuantityCoverage: 0,
    storeBrandCount: 0,
    organicCount: 0,
    warnings: [],
    scoreBreakdown: emptyScoreBreakdown,
  };
}

function buildScoreBreakdown({
  total,
  selectedStores,
  averageMatchScore,
  averageQuantityCoverage,
  storeBrandCount,
  organicCount,
  itemCount,
  preferences,
}: {
  total: number;
  selectedStores: Store[];
  averageMatchScore: number;
  averageQuantityCoverage: number;
  storeBrandCount: number;
  organicCount: number;
  itemCount: number;
  preferences: UserPreferences;
}): OptimizationScoreBreakdown {
  if (itemCount === 0) {
    return emptyScoreBreakdown;
  }

  const storeCount = selectedStores.length;
  const storeBrandShare = storeBrandCount / itemCount;
  const organicShare = organicCount / itemCount;
  const weights = optimizerWeights[preferences.optimizationGoal];
  const scores = {
    costFit: clampScore(100 - total),
    storeFit: clampScore(100 - Math.max(0, storeCount - 1) * 35),
    matchFit: clampScore(averageMatchScore),
    packageFit: clampScore(Math.min(averageQuantityCoverage, 1) * 100),
    organicFit: getOrganicFit(organicShare, preferences),
    brandFit: getBrandFit(storeBrandShare, preferences),
    budgetFit: getBudgetFit(total, preferences),
  };
  const totalWeight = sum(Object.values(weights));
  const weightedScore =
    totalWeight === 0
      ? 0
      : sum(
          Object.entries(scores).map(([key, value]) =>
            value * weights[key as keyof typeof weights],
          ),
        ) / totalWeight;

  return {
    ...scores,
    weightedScore: roundScore(weightedScore),
  };
}

function getOrganicFit(organicShare: number, preferences: UserPreferences): number {
  if (preferences.organicPreference === "required" || preferences.organicPreference === "prefer") {
    return clampScore(organicShare * 100);
  }

  if (preferences.organicPreference === "prefer_non_organic") {
    return clampScore((1 - organicShare) * 100);
  }

  return 100;
}

function getBrandFit(storeBrandShare: number, preferences: UserPreferences): number {
  if (preferences.brandFlexibility === "strict" || preferences.optimizationGoal === "preferred_brands") {
    return clampScore((1 - storeBrandShare) * 100);
  }

  if (preferences.brandFlexibility === "balanced") {
    return clampScore(100 - storeBrandShare * 25);
  }

  return 100;
}

function getBudgetFit(total: number, preferences: UserPreferences): number {
  if (preferences.budgetTarget <= 0 || total <= preferences.budgetTarget) {
    return 100;
  }

  return clampScore(100 - ((total - preferences.budgetTarget) / preferences.budgetTarget) * 100);
}

function buildUnmatchedNeed(
  need: GroceryNeed,
  preferences: UserPreferences,
  allCandidates: ProductCandidate[],
): UnmatchedNeed {
  const matchingProducts = findMatchingProducts(need);
  const matchingProductIds = new Set(matchingProducts.map((product) => product.id));
  const matchingOffers = offers.filter((offer) => matchingProductIds.has(offer.productId));
  const blockingConstraints = getBlockingConstraints(need, preferences);

  if (allCandidates.length > 0) {
    return {
      need,
      reason: "fulfillment_unavailable",
      blockingConstraints: [preferences.fulfillmentMode],
      suggestedActions: ["search_manually", "remove_item"],
    };
  }

  if (matchingOffers.length > 0 && matchingOffers.every((offer) => !offer.available)) {
    return {
      need,
      reason: "out_of_stock",
      blockingConstraints: ["availability"],
      suggestedActions: ["search_manually", "remove_item"],
    };
  }

  if (matchingProducts.length > 0 && blockingConstraints.length > 0) {
    return {
      need,
      reason: "constraint_conflict",
      blockingConstraints,
      suggestedActions: ["relax_constraint", "search_manually", "remove_item"],
    };
  }

  return {
    need,
    reason: "no_candidate",
    blockingConstraints: [],
    suggestedActions: ["search_manually", "remove_item"],
  };
}

function findMatchingProducts(need: GroceryNeed): typeof products {
  const normalizedNeed = normalizeText(need.canonicalName);

  return products.filter((product) =>
    [product.canonicalName, ...(product.aliases ?? [])]
      .map(normalizeText)
      .some((value) => value === normalizedNeed),
  );
}

function getBlockingConstraints(need: GroceryNeed, preferences: UserPreferences): string[] {
  const constraints: string[] = [];

  if (need.constraints.organic === true || preferences.organicPreference === "required") {
    constraints.push("organic");
  }

  for (const tag of need.constraints.dietaryTags ?? []) {
    constraints.push(tag);
  }

  if (need.constraints.brandPreference && need.constraints.brandPreference.length > 0) {
    constraints.push("brand");
  }

  return Array.from(new Set(constraints));
}

function getCartStatus(
  matchedItemCount: number,
  requestedNeedCount: number,
  unmatchedNeeds: UnmatchedNeed[],
): OptimizedCart["status"] {
  if (requestedNeedCount === 0 || matchedItemCount === 0) {
    return "blocked";
  }

  return unmatchedNeeds.length > 0 ? "needs_review" : "ready";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, roundScore(value)));
}

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

function getFulfillmentFee(store: Store, preferences: UserPreferences): number {
  return preferences.fulfillmentMode === "pickup" ? store.pickupFee : store.deliveryFee;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
