"use client";

import Image from "next/image";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  CartItem,
  CartPlanOption,
  FulfillmentMode,
  GroceryInferenceResult,
  GroceryNeed,
  OptimizationGoal,
  OptimizedCart,
  Product,
  ProductImage,
  UserPreferences,
} from "@/domain/grocery";
import { categoryFallbackImage, offers, resolveOfferImage } from "@/data/mockCatalog";
import { generateGroceryInference, generateGroceryNeeds } from "@/pipeline/needs";
import { buildOptimizedCart } from "@/pipeline/optimizer";
import { searchCatalogProducts } from "@/pipeline/productMatcher";
import { getLineTotal, getNeedQuantityForPackageCount, getPackageCount } from "@/pipeline/pricing";
import { waitForMinimumDuration } from "@/utils/minimumDelay";

const mealPrompt = "Cobb salad with chicken and rice for dinner";
const listPrompt = "milk, sandwich bread, bananas, oat milk, peanut butter, eggs";
const builderStorageKey = "agentic-grocery-cart-builder:v2";

const defaultPreferences: UserPreferences = {
  optimizationGoal: "cheapest",
  maxStores: 2,
  fulfillmentMode: "pickup",
  organicPreference: "none",
  brandFlexibility: "flexible",
  budgetTarget: 55,
};

const emptyScoreBreakdown: OptimizedCart["scoreBreakdown"] = {
  costFit: 0,
  storeFit: 0,
  matchFit: 0,
  packageFit: 0,
  organicFit: 0,
  brandFit: 0,
  budgetFit: 0,
  weightedScore: 0,
};

type BuilderMode = "meal" | "list";

const examplePrompts: Record<BuilderMode, string[]> = {
  meal: ["Chicken curry", "Tacos", "Pasta dinner"],
  list: ["Milk, eggs, bananas", "Oat milk", "Chicken, rice, peppers"],
};

const compactSectionHeadingClass = "text-lg font-semibold leading-6 text-[#241b18]";

type CartResult = {
  needs: GroceryNeed[];
  cart: OptimizedCart;
  inferenceWarnings: string[];
  clarifyingQuestion?: string;
  submittedInput: string;
};

type BadgeTone = "positive" | "negative" | "neutral" | "store" | "default" | "warning" | "blue" | "purple";

type PlanSwitchState = {
  targetPlanId: string;
  phase: "out" | "in";
};

type AddItemSuggestion = {
  product: Product;
  displayTitle: string;
  storeCount: number;
};

type PersistentBuilderState = {
  mode?: BuilderMode;
  drafts?: Record<BuilderMode, string>;
  preferences?: UserPreferences;
  results?: Partial<Record<BuilderMode, CartResult>>;
};

export function CartBuilder() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [mode, setMode] = useState<BuilderMode>("meal");
  const [drafts, setDrafts] = useState<Record<BuilderMode, string>>({
    meal: mealPrompt,
    list: listPrompt,
  });
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [results, setResults] = useState<Partial<Record<BuilderMode, CartResult>>>({});
  const [addItemInput, setAddItemInput] = useState("");
  const [addItemError, setAddItemError] = useState("");
  const [isBuilding, setIsBuilding] = useState(false);
  const [emptyStateAnimationKey, setEmptyStateAnimationKey] = useState(0);
  const [resultRevealKey, setResultRevealKey] = useState(0);
  const [planSwitch, setPlanSwitch] = useState<PlanSwitchState | null>(null);
  const buildInFlightRef = useRef(false);
  const planSwitchTimersRef = useRef<number[]>([]);

  const input = drafts[mode];
  const result = results[mode] ?? null;
  const addableProducts = searchCatalogProducts(addItemInput);
  const switchingPlanId = planSwitch?.targetPlanId ?? null;

  useEffect(() => {
    const readyTimer = window.setTimeout(() => {
      const savedState = readSavedBuilderState();

      if (savedState) {
        setMode(savedState.mode ?? "meal");
        setDrafts((current) => ({ ...current, ...savedState.drafts }));
        setPreferences((current) => ({ ...current, ...savedState.preferences }));
        setResults(savedState.results ?? {});
      }

      setIsHydrated(true);
    }, 0);

    return () => window.clearTimeout(readyTimer);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(
      builderStorageKey,
      JSON.stringify({
        mode,
        drafts,
        preferences,
        results,
      } satisfies PersistentBuilderState),
    );
  }, [drafts, isHydrated, mode, preferences, results]);

  useEffect(
    () => () => {
      planSwitchTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      planSwitchTimersRef.current = [];
    },
    [],
  );

  function switchMode(nextMode: BuilderMode) {
    setMode(nextMode);
  }

  function startOver() {
    if (result) {
      setEmptyStateAnimationKey((current) => current + 1);
    }

    setResults((current) => {
      const nextResults = { ...current };
      delete nextResults[mode];
      return nextResults;
    });
    setDrafts((current) => ({
      ...current,
      [mode]: mode === "meal" ? mealPrompt : listPrompt,
    }));
    setAddItemInput("");
    setAddItemError("");
  }

  function exportList() {
    if (!result) {
      return;
    }

    const lines = [
      `Cart builder export`,
      `Input: ${result.submittedInput}`,
      `Plan: ${
        getPlanDisplayTitle(result.cart.planOptions.find((plan) => plan.id === result.cart.activePlanId)?.title) ??
        "Custom cart"
      }`,
      `Total: $${result.cart.total.toFixed(2)}`,
      "",
      ...result.cart.items.map(
        (item) =>
          `${item.need.quantity} ${item.need.unit} ${item.need.displayName} - ${item.selected.offer.name} ($${getLineTotal(
            item.need,
            item.selected,
          ).toFixed(2)})`,
      ),
    ];

    const url = window.URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "grocery-cart.txt";
    link.click();
    window.URL.revokeObjectURL(url);
  }

  function updateInput(value: string) {
    setDrafts((current) => ({
      ...current,
      [mode]: value,
    }));
  }

  function updatePreferences(getNextPreferences: (current: UserPreferences) => UserPreferences) {
    const nextPreferences = getNextPreferences(preferences);

    setPreferences(nextPreferences);
    setResults((currentResults) =>
      Object.fromEntries(
        Object.entries(currentResults).map(([resultMode, currentResult]) => [
          resultMode,
          currentResult
            ? {
                ...currentResult,
                cart: buildOptimizedCart(currentResult.needs, nextPreferences),
              }
            : currentResult,
        ]),
      ) as Partial<Record<BuilderMode, CartResult>>,
    );
  }

  async function buildCart() {
    if (buildInFlightRef.current) {
      return;
    }

    const trimmedInput = input.trim();

    if (!trimmedInput) {
      setResults((current) => {
        const nextResults = { ...current };
        delete nextResults[mode];
        return nextResults;
      });
      return;
    }

    buildInFlightRef.current = true;
    setIsBuilding(true);
    try {
      const inference = await waitForMinimumDuration(
        generateGroceryInference(trimmedInput, mode === "meal" ? "recipe" : "manual_list", preferences),
      );
      const nextCart = buildOptimizedCart(inference.needs, preferences);

      setResults((current) => ({
        ...current,
        [mode]: {
          needs: inference.needs,
          cart: nextCart,
          inferenceWarnings: inference.warnings,
          clarifyingQuestion: inference.clarifyingQuestion,
          submittedInput: trimmedInput,
        },
      }));
      setResultRevealKey((current) => current + 1);
    } finally {
      buildInFlightRef.current = false;
      setIsBuilding(false);
    }
  }

  function saveResultFromNeeds(
    nextNeeds: GroceryNeed[],
    inferencePatch: Partial<GroceryInferenceResult> = {},
    nextPreferences = preferences,
  ) {
    const reindexedNeeds = reindexNeeds(nextNeeds);

    setResults((current) => ({
      ...current,
      [mode]: {
        needs: reindexedNeeds,
        cart: buildOptimizedCart(reindexedNeeds, nextPreferences),
        inferenceWarnings: inferencePatch.warnings ?? result?.inferenceWarnings ?? [],
        clarifyingQuestion: inferencePatch.clarifyingQuestion ?? result?.clarifyingQuestion,
        submittedInput: input.trim(),
      },
    }));
  }

  function removeItem(needId: string) {
    if (!result) {
      return;
    }

    saveResultFromNeeds(result.needs.filter((need) => need.id !== needId));
  }

  function decrementItem(needId: string) {
    if (!result) {
      return;
    }

    const targetItem = result.cart.items.find((item) => item.need.id === needId);

    if (!targetItem) {
      return;
    }

    const currentPackageCount = getPackageCount(targetItem.need, targetItem.selected);

    if (currentPackageCount <= 1) {
      removeItem(needId);
      return;
    }

    saveResultFromNeeds(
      result.needs.map((need) =>
        need.id === needId
          ? {
              ...need,
              quantity: getNeedQuantityForPackageCount(
                targetItem.need,
                targetItem.selected,
                currentPackageCount - 1,
              ),
            }
          : need,
      ),
    );
  }

  function incrementItem(needId: string) {
    if (!result) {
      return;
    }

    const targetItem = result.cart.items.find((item) => item.need.id === needId);

    if (!targetItem) {
      return;
    }

    const currentPackageCount = getPackageCount(targetItem.need, targetItem.selected);

    saveResultFromNeeds(
      result.needs.map((need) =>
        need.id === needId
          ? {
              ...need,
              quantity: getNeedQuantityForPackageCount(
                targetItem.need,
                targetItem.selected,
                currentPackageCount + 1,
              ),
            }
          : need,
      ),
    );
  }

  function addItemToCart(itemName = addItemInput) {
    if (!result) {
      return;
    }

    const nextNeeds = generateGroceryNeeds(itemName, "manual_list", preferences);
    const newNeed = nextNeeds[0];

    if (!newNeed) {
      setAddItemError("Choose one of the available mock catalog items below.");
      return;
    }

    const matchingNeed = result.needs.find((need) => need.canonicalName === newNeed.canonicalName);

    setAddItemError("");
    setAddItemInput("");

    if (matchingNeed) {
      incrementItem(matchingNeed.id);
      return;
    }

    saveResultFromNeeds([...result.needs, newNeed]);
  }

  function relaxUnmatchedNeed(needId: string) {
    if (!result) {
      return;
    }

    const nextPreferences =
      preferences.organicPreference === "required"
        ? {
            ...preferences,
            organicPreference: "prefer" as const,
          }
        : preferences;
    const nextNeeds = result.needs.map((need) =>
      need.id === needId
        ? {
            ...need,
            constraints: {
              ...need.constraints,
              organic: undefined,
              dietaryTags: [],
            },
          }
        : need,
    );

    if (nextPreferences !== preferences) {
      setPreferences(nextPreferences);
    }

    saveResultFromNeeds(nextNeeds, {}, nextPreferences);
  }

  function searchUnmatchedNeed(needId: string) {
    const unmatched = result?.cart.unmatchedNeeds.find((item) => item.need.id === needId);

    if (!unmatched) {
      return;
    }

    setAddItemInput(unmatched.need.displayName);
    setAddItemError("");
  }

  function increaseMaxStores() {
    updatePreferences((current) => ({
      ...current,
      maxStores: Math.min(3, current.maxStores + 1),
    }));
  }

  function switchAlternative(needId: string, offerId: string) {
    if (!result) {
      return;
    }

    const nextItems = result.cart.items.map((item) => {
      if (item.need.id !== needId) {
        return item;
      }

      const nextSelected = item.alternatives.find((candidate) => candidate.offer.id === offerId);

      if (!nextSelected) {
        return item;
      }

      const currentPackageCount = getPackageCount(item.need, item.selected);
      const nextNeed = {
        ...item.need,
        quantity: getNeedQuantityForPackageCount(item.need, nextSelected, currentPackageCount),
      };

      return {
        ...item,
        need: nextNeed,
        selected: nextSelected,
        alternatives: [item.selected, ...item.alternatives.filter((candidate) => candidate.offer.id !== offerId)],
      };
    });

    setResults((current) => ({
      ...current,
      [mode]: {
        ...result,
        needs: nextItems.map((item) => item.need),
        cart: rebuildCartFromItems(nextItems, preferences, result.cart.planOptions),
      },
    }));
  }

  function activateCartPlan(planId: string) {
    if (!result || planSwitch || result.cart.activePlanId === planId) {
      return;
    }

    const planOptions = result.cart.planOptions ?? [];
    const plan = planOptions.find((option) => option.id === planId);

    if (!plan) {
      return;
    }

    setPlanSwitch({ targetPlanId: planId, phase: "out" });

    const commitTimer = window.setTimeout(() => {
      setResults((current) => ({
        ...current,
        [mode]: {
          ...result,
          cart: cartFromPlanOption(plan, planOptions),
        },
      }));
      setPlanSwitch({ targetPlanId: planId, phase: "in" });
    }, 1_000);
    const settleTimer = window.setTimeout(() => {
      setPlanSwitch(null);
    }, 2_000);

    planSwitchTimersRef.current.push(commitTimer, settleTimer);
  }

  return (
    <main className="min-h-screen bg-[#f7f0e6] text-[#241b18]">
      <AppTopBar onExport={exportList} onStartOver={startOver} result={result} />
      <CartLoadingBlocker isVisible={isBuilding} />

      <div className="mx-auto grid max-w-[1640px] gap-6 px-4 py-6 xl:grid-cols-[436px_minmax(0,1fr)_360px]">
        <ShoppingBriefPanel
          input={input}
          isBuilding={isBuilding}
          isHydrated={isHydrated}
          mode={mode}
          preferences={preferences}
          onBuild={buildCart}
          onModeChange={switchMode}
          onPreferenceChange={updatePreferences}
          onPromptChange={updateInput}
        />

        <section className="grid content-start gap-3">
          {isBuilding ? (
            <CartBuildLoadingCanvas />
          ) : !result ? (
            <EmptyCartState key={`empty-${mode}-${emptyStateAnimationKey}`} />
          ) : result.needs.length === 0 ? (
            <ResultReveal key={resultRevealKey}>
              <UncertainInferenceState result={result} />
            </ResultReveal>
          ) : (
            <ResultReveal key={resultRevealKey}>
              <UnderstandingPanel result={result} />
              <ActiveCartPanel
                addableProducts={addableProducts}
                addItemError={addItemError}
                addItemInput={addItemInput}
                planSwitchPhase={planSwitch?.phase ?? null}
                preferences={preferences}
                result={result}
                onAddItem={addItemToCart}
                onAddItemInputChange={(value) => {
                  setAddItemInput(value);
                  setAddItemError("");
                }}
                onDecrementItem={decrementItem}
                onIncrementItem={incrementItem}
                onIncreaseStores={increaseMaxStores}
                onRelaxUnmatchedNeed={relaxUnmatchedNeed}
                onRemoveItem={removeItem}
                onSearchUnmatchedNeed={searchUnmatchedNeed}
                onSwitchAlternative={switchAlternative}
              />
            </ResultReveal>
          )}
        </section>

        <aside className="grid content-start gap-5 md:max-h-[calc(100vh+720px)] md:overflow-auto" data-testid="cart-options-column">
          {isBuilding ? (
            <CartOptionsLoadingCanvas />
          ) : result && result.needs.length > 0 ? (
            <ResultReveal key={`options-${resultRevealKey}`}>
              <CartPlanComparison
                activePlanIdOverride={switchingPlanId}
                cart={result.cart}
                isSwitching={Boolean(planSwitch)}
                onSelect={activateCartPlan}
              />
            </ResultReveal>
          ) : (
            <CartPlanPlaceholder />
          )}
        </aside>
      </div>
    </main>
  );
}

function CartPlanComparison({
  activePlanIdOverride,
  cart,
  isSwitching,
  onSelect,
}: {
  activePlanIdOverride?: string | null;
  cart: OptimizedCart;
  isSwitching: boolean;
  onSelect: (planId: string) => void;
}) {
  const planOptions = cart.planOptions ?? [];
  const visibleActivePlanId = activePlanIdOverride ?? cart.activePlanId;
  const activePlan = planOptions.find((plan) => plan.id === visibleActivePlanId) ?? planOptions[0];

  if (planOptions.length <= 1) {
    return null;
  }

  return (
    <section className="rounded border border-[#dfccb1] bg-[#fffaf2] p-3 shadow-[0_8px_28px_rgba(63,49,44,0.07)]" aria-label="Compare cart options">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={compactSectionHeadingClass}>Compare cart options</h2>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {planOptions.map((plan) => {
          const isActive = plan.id === visibleActivePlanId;
          const planTitle = getPlanDisplayTitle(plan.title);
          const storeLabel = formatPlanStores(plan.stores);
          const comparisonSummary = formatOptionComparisonSummary(plan.comparisonSummary);

          return (
            <article
              className={
                isActive
                  ? "rounded border border-[#7a1f2b] bg-[#fff6f1] p-3 shadow-[0_3px_12px_rgba(122,31,43,0.12)]"
                  : "rounded border border-[#dfccb1] bg-[#fffdf8] p-3 shadow-[0_1px_0_rgba(63,49,44,0.04)]"
              }
              data-testid={`cart-plan-${plan.id}`}
              key={plan.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-[#241b18]">{planTitle}</h3>
                  <Badge tone={getComparisonSummaryTone(comparisonSummary)}>{comparisonSummary}</Badge>
                </div>
                {plan.isRecommended ? <span className="text-sm font-semibold text-[#d49a00]">*</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="blue">{storeLabel}</Badge>
                {plan.status !== "ready" ? (
                  <Badge tone="warning">{plan.status === "blocked" ? "Blocked" : "Review"}</Badge>
                ) : null}
                {plan.unmatchedNeeds.length > 0 ? (
                  <Badge tone="negative">Missing {plan.unmatchedNeeds.length}</Badge>
                ) : null}
                {getPlanCardBadges(plan).map(({ label, tone }) => (
                  <Badge key={label} tone={tone}>
                    {label}
                  </Badge>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-[max-content_max-content_max-content] justify-between gap-2 text-[11px]">
                <div>
                  <p className="whitespace-nowrap font-semibold uppercase leading-3 text-[#8a7a68]">Grocery cost</p>
                  <p className="mt-0.5 whitespace-nowrap text-[15px] font-semibold leading-5 text-[#241b18]">${plan.subtotal.toFixed(2)}</p>
                </div>
                <div>
                  <p className="whitespace-nowrap font-semibold uppercase leading-3 text-[#8a7a68]">Fees</p>
                  <p className="mt-0.5 whitespace-nowrap text-[15px] font-semibold leading-5 text-[#241b18]">${plan.fees.toFixed(2)}</p>
                </div>
                <div>
                  <p className="whitespace-nowrap font-semibold uppercase leading-3 text-[#8a7a68]">Est. total</p>
                  <p className="mt-0.5 whitespace-nowrap text-[15px] font-semibold leading-5 text-[#241b18]">${plan.total.toFixed(2)}</p>
                </div>
              </div>
              <button
                className={
                  isActive
                    ? "mt-4 min-h-10 w-full rounded bg-[#7a1f2b] px-3 text-sm font-semibold text-white"
                    : "mt-4 min-h-10 w-full rounded border border-[#7a1f2b] bg-[#fffaf2] px-3 text-sm font-semibold text-[#7a1f2b] transition hover:bg-[#f8eadf]"
                }
                disabled={isActive || isSwitching}
                onClick={() => onSelect(plan.id)}
                type="button"
              >
                {isActive ? "Selected" : `Use ${planTitle}`}
              </button>
            </article>
          );
        })}
      </div>
      {activePlan ? (
        <section
          className="mt-3 rounded border border-[#dfccb1] bg-[#fffdf8] p-3"
          data-testid="selected-option-breakdown"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[#241b18]">Selected option</h3>
            <span className="text-sm font-semibold text-[#7a1f2b]">{getPlanDisplayTitle(activePlan.title)}</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-[#8a7a68]">Why</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {getSelectedOptionWhy(activePlan).map((label) => (
                  <Badge key={label}>{label}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-[#8a7a68]">Tradeoffs</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {getSelectedOptionTradeoffs(activePlan).map((label) => (
                  <Badge key={label} tone={getTradeoffBadgeTone(label)}>
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function CartPlanPlaceholder() {
  return (
    <section className="rounded border border-dashed border-[#d8c6ad] bg-[#fffaf2]/80 p-3 text-sm leading-6 text-[#6f6256]">
      <h2 className={compactSectionHeadingClass}>Compare cart options</h2>
      <p className="mt-2">Build your cart to see available options</p>
    </section>
  );
}

function ResultReveal({ children }: { children: ReactNode }) {
  return (
    <div className="cart-result-reveal grid content-start gap-3" data-testid="cart-result-reveal">
      {children}
    </div>
  );
}

function CartBuildLoadingCanvas() {
  return (
    <section
      aria-live="polite"
      className="min-h-[520px] rounded border border-[#dfccb1] bg-[#fffaf2] p-6 shadow-[0_8px_28px_rgba(63,49,44,0.07)]"
      data-testid="cart-build-loading-canvas"
      role="status"
    >
      <div className="mx-auto flex h-full min-h-[460px] max-w-md flex-col items-center justify-center text-center">
        <span
          aria-hidden="true"
          className="h-8 w-8 animate-spin rounded-full border-2 border-[#d8c6ad] border-t-[#7a1f2b]"
        />
        <h2 className="mt-4 text-lg font-semibold text-[#241b18]">Building cart</h2>
        <div className="mt-6 grid w-full gap-3">
          <div className="cart-loading-line h-3 rounded-full bg-[#eadfce]" />
          <div className="cart-loading-line mx-auto h-3 w-4/5 rounded-full bg-[#f0e6d8]" />
          <div className="cart-loading-line mx-auto h-3 w-2/3 rounded-full bg-[#f0e6d8]" />
        </div>
        <div className="cart-loading-card mt-8 grid w-full gap-2 rounded border border-[#eadfce] bg-[#fffdf8] p-3 text-left">
          <div className="h-3 w-1/2 rounded-full bg-[#eadfce]" />
          <div className="h-2.5 w-5/6 rounded-full bg-[#f0e6d8]" />
          <div className="h-2.5 w-2/3 rounded-full bg-[#f0e6d8]" />
        </div>
      </div>
    </section>
  );
}

function CartOptionsLoadingCanvas() {
  return (
    <section
      className="rounded border border-dashed border-[#d8c6ad] bg-[#fffaf2]/80 p-3 text-sm leading-6 text-[#6f6256]"
      data-testid="cart-options-loading-canvas"
    >
      <h2 className={compactSectionHeadingClass}>Compare cart options</h2>
      <div className="mt-4 grid gap-3">
        <div className="h-24 rounded border border-[#eadfce] bg-[#fffdf8]" />
        <div className="h-24 rounded border border-[#eadfce] bg-[#fffdf8]" />
      </div>
    </section>
  );
}

function AppTopBar({
  onExport,
  onStartOver,
  result,
}: {
  onExport: () => void;
  onStartOver: () => void;
  result: CartResult | null;
}) {
  return (
    <header className="relative z-20 border-b border-[#4a1720] bg-[#681d2a] text-[#fff7ea] shadow-[0_3px_16px_rgba(36,27,24,0.16)]">
      <div className="mx-auto flex min-h-16 max-w-[1560px] items-center gap-3 px-4">
        <button
          aria-label="Open navigation"
          className="flex h-10 w-10 items-center justify-center rounded border border-transparent text-xl text-[#fff7ea] hover:border-[#cfae8a]"
          type="button"
        >
          =
        </button>
        <div className="h-8 border-l border-[#8f4b55]" />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Image
            alt=""
            aria-hidden="true"
            className="h-14 w-14 shrink-0 sm:h-16 sm:w-16"
            data-testid="app-header-logo"
            height={64}
            priority
            src="/brand/gini-grape-logo-white-circle.png"
            width={64}
          />
          <h1 className="truncate text-xl font-semibold text-[#fff7ea]">Gini, Your AI Grocery Shopper</h1>
        </div>
        <button
          className="hidden min-h-9 items-center gap-1.5 rounded-full border border-[#cfae8a] bg-[#fff7ea] px-3 text-xs font-semibold text-[#681d2a] transition hover:bg-[#f1dcc6] sm:inline-flex"
          onClick={onStartOver}
          type="button"
        >
          <ResetActionIcon />
          Clear Cart
        </button>
        <button
          className="hidden min-h-9 rounded-full border border-[#cfae8a] bg-[#fff7ea] px-3 text-xs font-semibold text-[#681d2a] transition hover:bg-[#f1dcc6] disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex sm:items-center"
          disabled={!result}
          onClick={onExport}
          type="button"
        >
          Export Grocery List
        </button>
        <button
          className="min-h-10 rounded bg-[#fff7ea] px-4 text-sm font-semibold text-[#681d2a] shadow-sm transition hover:bg-[#f1dcc6] disabled:cursor-not-allowed disabled:bg-[#b08a8e] disabled:text-white"
          disabled={!result || result.cart.status === "blocked" || result.cart.items.length === 0}
          type="button"
        >
          Checkout options
        </button>
      </div>
    </header>
  );
}

function CartLoadingBlocker({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) {
    return null;
  }

  return (
    <div aria-hidden="true" className="fixed inset-0 z-40 cursor-wait bg-transparent" data-testid="cart-loading-blocker" />
  );
}

function ShoppingBriefPanel({
  input,
  isBuilding,
  isHydrated,
  mode,
  preferences,
  onBuild,
  onModeChange,
  onPreferenceChange,
  onPromptChange,
}: {
  input: string;
  isBuilding: boolean;
  isHydrated: boolean;
  mode: BuilderMode;
  preferences: UserPreferences;
  onBuild: () => Promise<void>;
  onModeChange: (mode: BuilderMode) => void;
  onPreferenceChange: (getNextPreferences: (current: UserPreferences) => UserPreferences) => void;
  onPromptChange: (value: string) => void;
}) {
  return (
    <aside
      className="rounded border border-[#dfccb1] bg-[#fffaf2] p-5 pt-3 shadow-[0_8px_28px_rgba(63,49,44,0.07)] xl:sticky xl:top-[82px]"
      aria-label="Shopping brief"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onBuild();
        }}
      >
        <h2 className={compactSectionHeadingClass}>
          {mode === "meal" ? "What would you like to make?" : "What's on your list?"}
        </h2>

        <div className="mt-4 grid grid-cols-2 rounded border border-[#dfccb1] bg-[#f4eadc] p-1.5">
          <button
            className={mode === "meal" ? activeSegmentClass : segmentClass}
            onClick={() => onModeChange("meal")}
            type="button"
          >
            Meal idea
          </button>
          <button
            className={mode === "list" ? activeSegmentClass : segmentClass}
            onClick={() => onModeChange("list")}
            type="button"
          >
            Grocery list
          </button>
        </div>

        <label className="sr-only" htmlFor="grocery-input">
          {mode === "meal" ? "Meal idea" : "Grocery list"}
        </label>
        <div className="relative mt-4">
          <SearchIcon className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-[#8a7a68]" />
          <textarea
            id="grocery-input"
            aria-label={mode === "meal" ? "Meal idea" : "Grocery list"}
            className="min-h-40 w-full resize-none rounded border border-[#dfccb1] bg-[#fffdf8] py-4 pl-12 pr-4 text-base leading-7 outline-none shadow-inner shadow-[#eadfce]/30 transition placeholder:text-[#8a7a68] focus:border-[#7a1f2b] focus:ring-2 focus:ring-[#7a1f2b]/15"
            value={input}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void onBuild();
              }
            }}
          />
        </div>
        <button
          aria-label="Build cart"
          className="mt-4 min-h-12 w-full rounded bg-[#7a1f2b] px-4 text-base font-semibold text-white shadow-[0_5px_14px_rgba(122,31,43,0.22)] transition hover:bg-[#651923] disabled:cursor-not-allowed disabled:bg-[#b08a8e]"
          disabled={!isHydrated || isBuilding}
          type="submit"
        >
          {isBuilding ? "Building..." : "Build cart"}
        </button>
        <div className="mt-3 flex flex-wrap gap-3 border-b border-[#eadfce] pb-4 text-sm">
          <span className="text-[#8a7a68]">Examples:</span>
          {examplePrompts[mode].map((example) => (
            <button
              className="font-semibold text-[#7a1f2b] hover:underline"
              key={example}
              onClick={() => onPromptChange(example)}
              type="button"
            >
              {example}
            </button>
          ))}
        </div>
      </form>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[#241b18]">Preferences</h2>
          <button
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7a1f2b] hover:underline"
            onClick={() => onPreferenceChange(() => defaultPreferences)}
            type="button"
          >
            <PreferenceIcon name="reset" />
            Reset
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          <PreferenceSelect
            icon="strategy"
            label="Cart strategy"
            value={preferences.optimizationGoal}
            options={[
              ["cheapest", "Cheapest"],
              ["best_value", "Best value"],
              ["fewest_stores", "Fewest stores"],
              ["preferred_brands", "Preferred brands"],
            ]}
            onChange={(value) =>
              onPreferenceChange((current) => ({ ...current, optimizationGoal: value as OptimizationGoal }))
            }
          />
          <label className="flex min-w-0 w-[394px] max-w-full items-center gap-3 text-sm font-medium text-[#3f312c]">
            <PreferenceFieldLabel icon="stores" label="Max stores" />
            <input
              id="preference-max-stores"
              className="h-10 w-[180px] justify-self-end rounded border border-[#dfccb1] bg-[#fffdf8] px-3 text-sm outline-none focus:border-[#7a1f2b] focus:ring-2 focus:ring-[#7a1f2b]/15"
              max={3}
              min={1}
              type="number"
              value={preferences.maxStores}
              onChange={(event) =>
                onPreferenceChange((current) => ({ ...current, maxStores: Math.max(1, Number(event.target.value)) }))
              }
            />
          </label>
          <PreferenceSelect
            icon="fulfillment"
            label="Fulfillment"
            value={preferences.fulfillmentMode}
            options={[
              ["pickup", "Pickup"],
              ["delivery", "Delivery"],
            ]}
            onChange={(value) =>
              onPreferenceChange((current) => ({ ...current, fulfillmentMode: value as FulfillmentMode }))
            }
          />
          <PreferenceSelect
            icon="organic"
            label="Organic"
            value={preferences.organicPreference}
            options={[
              ["none", "No preference"],
              ["prefer", "Prefer organic"],
              ["prefer_non_organic", "Prefer non-organic"],
              ["required", "Require organic"],
            ]}
            onChange={(value) =>
              onPreferenceChange((current) => ({
                ...current,
                organicPreference: value as UserPreferences["organicPreference"],
              }))
            }
          />
          <PreferenceSelect
            icon="brands"
            label="Brands"
            value={preferences.brandFlexibility}
            options={[
              ["flexible", "Flexible"],
              ["balanced", "Balanced"],
              ["strict", "Strict"],
            ]}
            onChange={(value) =>
              onPreferenceChange((current) => ({
                ...current,
                brandFlexibility: value as UserPreferences["brandFlexibility"],
              }))
            }
          />
          <label className="flex min-w-0 w-[394px] max-w-full items-center gap-3 text-sm font-medium text-[#3f312c]">
            <PreferenceFieldLabel icon="budget" label="Budget target" />
            <input
              id="preference-budget-target"
              className="h-10 w-[180px] justify-self-end rounded border border-[#dfccb1] bg-[#fffdf8] px-3 text-sm outline-none focus:border-[#7a1f2b] focus:ring-2 focus:ring-[#7a1f2b]/15"
              min={0}
              type="number"
              value={preferences.budgetTarget}
              onChange={(event) =>
                onPreferenceChange((current) => ({
                  ...current,
                  budgetTarget: Number(event.target.value),
                }))
              }
            />
          </label>
          <p
            className="flex w-full items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded border border-[#dfccb1] bg-[#fff6f1] px-2 py-2 text-center text-[13px] font-medium leading-5 text-[#7a1f2b]"
            data-testid="budget-helper"
          >
            <PreferenceIcon name="info" />
            <span>Budget is a soft target which informs recommendations</span>
          </p>
        </div>
      </div>
    </aside>
  );
}

function PreferenceSelect({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: PreferenceIconName;
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  const id = `preference-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <label
      className="flex min-w-0 w-[394px] max-w-full items-center gap-3 text-sm font-medium text-[#3f312c]"
      htmlFor={id}
    >
      <PreferenceFieldLabel icon={icon} label={label} />
      <select
        id={id}
        className="h-10 w-[180px] justify-self-end rounded border border-[#dfccb1] bg-[#fffdf8] px-3 text-sm outline-none focus:border-[#7a1f2b] focus:ring-2 focus:ring-[#7a1f2b]/15"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

type PreferenceIconName = "strategy" | "stores" | "fulfillment" | "organic" | "brands" | "budget" | "reset" | "info";

function PreferenceFieldLabel({ icon, label }: { icon: PreferenceIconName; label: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <PreferenceIcon name={icon} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function PreferenceIcon({ name }: { name: PreferenceIconName }) {
  const commonProps = {
    "aria-hidden": true,
    className: "h-5 w-5 shrink-0 text-[#7a1f2b]",
    "data-testid": `preference-icon-${name}`,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  if (name === "strategy") {
    return (
      <svg {...commonProps}>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 4 4" />
        <path d="M11 7v4l3 2" />
      </svg>
    );
  }

  if (name === "stores") {
    return (
      <svg {...commonProps}>
        <path d="M4 11 12 4l8 7" />
        <path d="M6 10v9h12v-9" />
        <path d="M10 19v-5h4v5" />
      </svg>
    );
  }

  if (name === "fulfillment") {
    return (
      <svg {...commonProps}>
        <rect height="14" rx="2" width="12" x="6" y="5" />
        <path d="M9 9h6" />
        <path d="M9 13h4" />
        <path d="M8 5l1-2h6l1 2" />
      </svg>
    );
  }

  if (name === "organic") {
    return (
      <svg {...commonProps}>
        <path d="M12 21s7-3.5 7-10V5l-7-3-7 3v6c0 6.5 7 10 7 10Z" />
        <path d="m9 12 2 2 4-5" />
      </svg>
    );
  }

  if (name === "brands") {
    return (
      <svg {...commonProps}>
        <rect height="14" rx="3" width="14" x="5" y="5" />
        <path d="m9 9 6 6" />
        <path d="m15 9-6 6" />
      </svg>
    );
  }

  if (name === "budget") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v10" />
        <path d="M9.5 9.5c.6-1 4.4-1 5 0" />
        <path d="M9.5 14.5c.6 1 4.4 1 5 0" />
      </svg>
    );
  }

  if (name === "reset") {
    return (
      <svg {...commonProps}>
        <path d="M4 7v5h5" />
        <path d="M5.5 12A7 7 0 1 0 8 6.7L4 10" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function SearchIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 3.5 3.5" />
    </svg>
  );
}

function getCartNeedElementId(needId: string): string {
  return `cart-line-${needId}`;
}

function getReviewNeedElementId(needId: string): string {
  return `review-line-${needId}`;
}

function ResetActionIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M4 7v5h5" />
      <path d="M5.5 12A7 7 0 1 0 8 6.7L4 10" />
    </svg>
  );
}

function Total({
  label,
  testId,
  value,
  strong,
}: {
  label: string;
  testId?: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <p className={strong ? "font-semibold text-[#241b18]" : "text-[#5d5049]"}>{label}</p>
      <p
        className={strong ? "text-xl font-bold text-[#241b18]" : "font-medium text-[#241b18]"}
        data-testid={testId}
      >
        {value}
      </p>
    </div>
  );
}

function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  const semanticTone = normalizeBadgeTone(tone);
  const className =
    semanticTone === "negative"
      ? "rounded-md bg-[#f7e8e7] px-2 py-1 text-xs font-semibold text-[#7a1f2b]"
      : semanticTone === "neutral"
        ? "rounded-md bg-[#f3e7d8] px-2 py-1 text-xs font-semibold text-[#6b3f2a]"
        : semanticTone === "store"
          ? "rounded-md bg-[#e7f0fb] px-2 py-1 text-xs font-semibold text-[#22577a]"
          : "rounded-md bg-[#e6f3ea] px-2 py-1 text-xs font-semibold text-[#1f6b3a]";

  return (
    <span className={className} data-tone={semanticTone}>
      {children}
    </span>
  );
}

function HeaderStatusBadge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "warning";
}) {
  const className =
    tone === "warning"
      ? "rounded bg-[#f7e8e7] px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-[#7a1f2b]"
      : "rounded bg-[#e6f3ea] px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-[#1f6b3a]";

  return (
    <span className={className} data-tone={tone === "warning" ? "negative" : "positive"}>
      {children}
    </span>
  );
}

function UnderstandingPanel({ result }: { result: CartResult }) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const chipRegionRef = useRef<HTMLDivElement | null>(null);
  const chipMeasureRef = useRef<HTMLDivElement | null>(null);
  const [visibleNeedCount, setVisibleNeedCount] = useState(Math.min(8, result.needs.length));
  const visibleNeeds = result.needs.slice(0, visibleNeedCount);
  const hiddenNeeds = result.needs.slice(visibleNeedCount);
  const hiddenNeedCount = Math.max(0, result.needs.length - visibleNeeds.length);

  useLayoutEffect(() => {
    const chipRegion = chipRegionRef.current;
    const chipMeasure = chipMeasureRef.current;

    if (!chipRegion || !chipMeasure) {
      return;
    }

    const chipRegionElement = chipRegion;
    const chipMeasureElement = chipMeasure;

    function getRowsForWidths(widths: number[], containerWidth: number) {
      let rows = 1;
      let rowWidth = 0;

      widths.forEach((width, index) => {
        const nextWidth = rowWidth === 0 ? width : rowWidth + 2 + width;

        if (nextWidth > containerWidth && index > 0) {
          rows += 1;
          rowWidth = width;
        } else {
          rowWidth = nextWidth;
        }
      });

      return rows;
    }

    function calculateVisibleCount() {
      const containerWidth = chipRegionElement.clientWidth;
      const measuredChips = Array.from(chipMeasureElement.querySelectorAll<HTMLElement>("[data-measure-chip]"));
      const moreChip = chipMeasureElement.querySelector<HTMLElement>("[data-measure-more]");

      if (containerWidth <= 0 || measuredChips.length === 0) {
        return;
      }

      const chipWidths = measuredChips.map((chip) => Math.ceil(chip.getBoundingClientRect().width));
      const moreWidth = moreChip ? Math.ceil(moreChip.getBoundingClientRect().width) : 0;
      const maxDefaultVisible = Math.min(8, result.needs.length);

      for (let count = maxDefaultVisible; count >= 1; count -= 1) {
        const widths = chipWidths.slice(0, count);

        if (result.needs.length > count && moreWidth > 0) {
          widths.push(moreWidth);
        }

        if (getRowsForWidths(widths, containerWidth) <= 2) {
          setVisibleNeedCount(count);
          return;
        }
      }

      setVisibleNeedCount(Math.min(1, result.needs.length));
    }

    calculateVisibleCount();

    const resizeObserver = new ResizeObserver(calculateVisibleCount);
    resizeObserver.observe(chipRegionElement);

    return () => resizeObserver.disconnect();
  }, [result.needs]);

  useLayoutEffect(() => {
    const chipRegion = chipRegionRef.current;

    if (!chipRegion || visibleNeedCount <= 1) {
      return;
    }

    const regionRect = chipRegion.getBoundingClientRect();
    const visibleChips = Array.from(
      chipRegion.querySelectorAll<HTMLElement>("[data-testid='inference-chip'], [data-testid='inference-more-button']"),
    );
    const hasClippedChip = visibleChips.some((chip) => {
      const rect = chip.getBoundingClientRect();

      return (
        rect.top < regionRect.top - 1 ||
        rect.bottom > regionRect.bottom + 1 ||
        rect.left < regionRect.left - 1 ||
        rect.right > regionRect.right + 1
      );
    });

    if (hasClippedChip) {
      setVisibleNeedCount((current) => Math.max(1, current - 1));
    }
  }, [result.needs.length, visibleNeedCount]);

  function scrollToNeed(needId: string) {
    const target =
      document.getElementById(getCartNeedElementId(needId)) ??
      document.getElementById(getReviewNeedElementId(needId));

    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    setIsMoreOpen(false);
  }

  return (
    <section className="relative z-20 rounded border border-[#dfccb1] bg-[#fffaf2] p-3 shadow-[0_5px_18px_rgba(63,49,44,0.06)]">
      <h2 className={compactSectionHeadingClass}>Inferred from your cart</h2>

      <div className="relative mt-2" data-testid="inference-chip-region">
        <div className="flex max-h-[38px] flex-wrap gap-0.5 overflow-hidden" data-testid="inference-visible-chips" ref={chipRegionRef}>
          {visibleNeeds.map((need) => (
            <button
              className="inline-flex h-[18px] items-center whitespace-nowrap rounded-full border border-[#e0ccb0] bg-[#fffdf8] px-1.5 text-[10px] font-semibold leading-none text-[#7a1f2b] transition hover:border-[#7a1f2b] hover:bg-[#f8eadf]"
              data-testid="inference-chip"
              key={need.id}
              onClick={() => scrollToNeed(need.id)}
              style={{ fontSize: "10px" }}
              type="button"
            >
              {need.displayName}
            </button>
          ))}
          {hiddenNeedCount > 0 ? (
            <button
              aria-expanded={isMoreOpen}
              className="inline-flex h-[18px] items-center whitespace-nowrap rounded-full border border-[#e0ccb0] bg-[#fffdf8] px-1.5 text-[10px] font-semibold leading-none text-[#5d5049] transition hover:border-[#7a1f2b] hover:bg-[#f8eadf]"
              data-testid="inference-more-button"
              onClick={() => setIsMoreOpen((current) => !current)}
              style={{ fontSize: "10px" }}
              type="button"
            >
              +{hiddenNeedCount} more
            </button>
          ) : null}
        </div>
        {isMoreOpen ? (
          <div
            className="absolute left-0 top-full z-50 mt-2 grid max-h-44 min-w-48 gap-1 overflow-auto rounded border border-[#dfccb1] bg-[#fffdf8] p-2 shadow-[0_8px_24px_rgba(63,49,44,0.14)]"
            data-testid="inference-more-menu"
          >
            {hiddenNeeds.map((need) => (
              <button
                className="rounded px-2 py-1 text-left text-xs font-semibold text-[#7a1f2b] hover:bg-[#f8eadf]"
                data-testid="inference-hidden-chip"
                key={need.id}
                onClick={() => scrollToNeed(need.id)}
                type="button"
              >
                {need.displayName}
              </button>
            ))}
          </div>
        ) : null}
        <div
          aria-hidden="true"
          className="pointer-events-none invisible absolute left-0 top-0 flex flex-wrap gap-0.5"
          ref={chipMeasureRef}
        >
          {result.needs.map((need) => (
            <span
              className="inline-flex h-[18px] items-center whitespace-nowrap rounded-full border border-[#e0ccb0] px-1.5 text-[10px] font-semibold leading-none"
              data-measure-chip=""
              key={need.id}
              style={{ fontSize: "10px" }}
            >
              {need.displayName}
            </span>
          ))}
          <span
            className="inline-flex h-[18px] items-center whitespace-nowrap rounded-full border border-[#e0ccb0] px-1.5 text-[10px] font-semibold leading-none"
            data-measure-more=""
            style={{ fontSize: "10px" }}
          >
            +{Math.max(1, result.needs.length - 1)} more
          </span>
        </div>
      </div>

      <div className="mt-2 grid gap-1 text-xs leading-5 text-[#5d5049]" data-testid="inference-helper-copy">
        {result.clarifyingQuestion ? <p>{result.clarifyingQuestion}</p> : null}
        <p>Missing something? Add or remove items in your cart.</p>
      </div>
    </section>
  );
}

function EmptyCartState() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded border border-[#dfccb1] bg-[#fffaf2] p-8 text-center shadow-[0_8px_28px_rgba(63,49,44,0.07)]">
      <h2 className="text-3xl font-semibold text-[#241b18]">
        <TypewriterText text="Build your grocery cart, your way" />
      </h2>
    </div>
  );
}

function TypewriterText({ text }: { text: string }) {
  return (
    <span
      className="typewriter-text"
      data-testid="empty-state-typewriter"
      style={{ "--typewriter-steps": text.length } as CSSProperties}
    >
      {text}
    </span>
  );
}

function UncertainInferenceState({ result }: { result: CartResult }) {
  return (
    <div className="flex min-h-[520px] items-center justify-center rounded border border-[#dfccb1] bg-[#fffaf2] p-8 text-center shadow-[0_8px_28px_rgba(63,49,44,0.07)]">
      <div className="max-w-lg">
        <p className="text-sm font-semibold uppercase text-[#8a7a68]">Needs review</p>
        <h2 className="mt-3 text-3xl font-semibold text-[#241b18]">I could not build a reliable cart yet</h2>
        {result.clarifyingQuestion ? (
          <p className="mt-4 text-sm leading-6 text-[#6f6256]">{result.clarifyingQuestion}</p>
        ) : null}
        {result.inferenceWarnings.map((warning, index) => (
          <p className="mt-3 text-sm leading-6 text-[#775000]" key={`${warning}-${index}`}>
            {warning}
          </p>
        ))}
      </div>
    </div>
  );
}

function ActiveCartPanel({
  addableProducts,
  addItemError,
  addItemInput,
  planSwitchPhase,
  preferences,
  result,
  onAddItem,
  onAddItemInputChange,
  onDecrementItem,
  onIncrementItem,
  onIncreaseStores,
  onRelaxUnmatchedNeed,
  onRemoveItem,
  onSearchUnmatchedNeed,
  onSwitchAlternative,
}: {
  addableProducts: ReturnType<typeof searchCatalogProducts>;
  addItemError: string;
  addItemInput: string;
  planSwitchPhase: PlanSwitchState["phase"] | null;
  preferences: UserPreferences;
  result: CartResult | null;
  onAddItem: (itemName?: string) => void;
  onAddItemInputChange: (value: string) => void;
  onDecrementItem: (needId: string) => void;
  onIncrementItem: (needId: string) => void;
  onIncreaseStores: () => void;
  onRelaxUnmatchedNeed: (needId: string) => void;
  onRemoveItem: (needId: string) => void;
  onSearchUnmatchedNeed: (needId: string) => void;
  onSwitchAlternative: (needId: string, offerId: string) => void;
}) {
  const cart = result?.cart ?? null;
  const derivedUnmatchedNeeds =
    result && cart
      ? result.needs.filter((need) => !cart.items.some((item) => item.need.id === need.id))
      : [];
  const unmatchedNeeds = cart?.unmatchedNeeds ?? derivedUnmatchedNeeds.map((need) => ({
    need,
    reason: "no_candidate" as const,
    blockingConstraints: [],
    suggestedActions: ["search_manually" as const, "remove_item" as const],
  }));
  const activePlanTitle =
    getPlanDisplayTitle(cart?.planOptions.find((plan) => plan.id === cart.activePlanId)?.title) ?? "Recommended";
  const itemCount = cart?.items.length ?? 0;
  const budgetTarget = preferences.budgetTarget;
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchWrapperRef = useRef<HTMLDivElement | null>(null);
  const trimmedAddItemInput = addItemInput.trim();
  const addItemSuggestions = addableProducts.map(getAddItemSuggestion);
  const showAddItemDropdown = isSearchOpen && trimmedAddItemInput.length > 0;
  const effectiveHighlightedIndex =
    showAddItemDropdown && addItemSuggestions.length > 0
      ? Math.min(Math.max(highlightedIndex, 0), addItemSuggestions.length - 1)
      : -1;
  const activeSuggestion =
    effectiveHighlightedIndex >= 0 && effectiveHighlightedIndex < addItemSuggestions.length
      ? addItemSuggestions[effectiveHighlightedIndex]
      : null;
  const dropdownId = "add-item-search-results";

  useEffect(() => {
    function closeSearchOnOutsidePointer(event: PointerEvent) {
      if (!searchWrapperRef.current?.contains(event.target as Node)) {
        setIsSearchOpen(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener("pointerdown", closeSearchOnOutsidePointer);

    return () => document.removeEventListener("pointerdown", closeSearchOnOutsidePointer);
  }, []);

  function closeAddItemSearch() {
    setIsSearchOpen(false);
    setHighlightedIndex(-1);
  }

  function addSuggestionToCart(suggestion: AddItemSuggestion) {
    closeAddItemSearch();
    onAddItem(suggestion.product.canonicalName);
  }

  function handleAddItemKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAddItemSearch();
      return;
    }

    if (event.key === "Tab") {
      closeAddItemSearch();
      return;
    }

    if (event.key === "ArrowDown") {
      if (trimmedAddItemInput.length === 0 || addItemSuggestions.length === 0) {
        return;
      }

      event.preventDefault();
      setIsSearchOpen(true);
      setHighlightedIndex((current) => ((current < 0 ? 0 : current) + 1) % addItemSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      if (trimmedAddItemInput.length === 0 || addItemSuggestions.length === 0) {
        return;
      }

      event.preventDefault();
      setIsSearchOpen(true);
      setHighlightedIndex((current) =>
        current <= 0 ? addItemSuggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter" && showAddItemDropdown && activeSuggestion) {
      event.preventDefault();
      addSuggestionToCart(activeSuggestion);
    }
  }

  return (
    <section
      className="cart-option-switch-shell rounded border border-[#dfccb1] bg-[#fffaf2] p-3 shadow-[0_10px_34px_rgba(63,49,44,0.08)]"
      aria-label="Active cart"
      data-testid="active-cart-transition-shell"
      data-switch-phase={planSwitchPhase ?? "idle"}
      data-transitioning={planSwitchPhase ? "true" : "false"}
      style={{
        animation: "none",
        opacity: planSwitchPhase === "out" ? 0 : 1,
        transition: "opacity 1000ms ease-in-out",
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#eadfce] pb-2">
        <div className="min-w-0 flex-1">
          <h2 className={`${compactSectionHeadingClass} flex flex-wrap items-baseline gap-1.5`} data-testid="active-cart-title">
            <span>Active Cart</span>
            {cart ? (
              <span className="text-sm font-semibold leading-5 text-[#7a1f2b]" data-testid="active-cart-plan-title">
                {toTitleCase(activePlanTitle)}
              </span>
            ) : null}
          </h2>
          <p className="mt-1 text-sm text-[#3f312c]">
            {cart ? `${itemCount} items` : "No items yet"}{" "}
            {cart ? cart.status === "ready" ? <HeaderStatusBadge>All items available</HeaderStatusBadge> : cart.status === "blocked" ? <HeaderStatusBadge tone="warning">Blocked</HeaderStatusBadge> : <HeaderStatusBadge tone="warning">Review</HeaderStatusBadge> : null}
          </p>
        </div>
        {cart ? <CartTopTotals cart={cart} /> : null}
      </div>

      {!cart || !result || result.needs.length === 0 ? (
        <div className="py-8 text-sm leading-6 text-[#6f6256]">
          Build a meal or grocery list to see the editable cart here.
        </div>
      ) : (
        <>
          {unmatchedNeeds.length > 0 ? (
            <div className="mt-3 scroll-mt-40 border-b border-[#eadfce] py-3" aria-label="Needs review">
              <h3 className="text-sm font-semibold text-[#241b18]">Needs review</h3>
              <div className="mt-3 grid gap-2">
                {unmatchedNeeds.map((unmatched) => (
                  <div
                    className="grid gap-3 rounded border border-[#f0d69c] bg-[#fff8e7] px-3 py-2 text-sm sm:flex sm:items-center sm:justify-between"
                    id={getReviewNeedElementId(unmatched.need.id)}
                    key={unmatched.need.id}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ProductThumbnail
                        className="h-10 w-10"
                        image={categoryFallbackImage(unmatched.need.category)}
                        testId="unmatched-need-image"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-[#241b18]">{unmatched.need.displayName}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge tone="warning">{getUnmatchedReasonLabel(unmatched.reason)}</Badge>
                          {unmatched.blockingConstraints.map((constraint) => (
                            <Badge key={constraint} tone="negative">
                              {constraint}
                            </Badge>
                          ))}
                          {unmatched.need.confidence < 0.75 ? <Badge tone="negative">Review</Badge> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-start gap-2 sm:justify-end">
                      {unmatched.suggestedActions.includes("relax_constraint") ? (
                        <button
                          className="scroll-mt-24 rounded border border-[#dfccb1] bg-[#fffdf8] px-2 py-1 text-xs font-semibold text-[#7a1f2b] hover:bg-[#f8eadf]"
                          onClick={() => onRelaxUnmatchedNeed(unmatched.need.id)}
                          type="button"
                        >
                          Relax
                        </button>
                      ) : null}
                      {unmatched.suggestedActions.includes("increase_max_stores") && preferences.maxStores < 3 ? (
                        <button
                          className="scroll-mt-24 rounded border border-[#dfccb1] bg-[#fffdf8] px-2 py-1 text-xs font-semibold text-[#7a1f2b] hover:bg-[#f8eadf]"
                          onClick={onIncreaseStores}
                          type="button"
                        >
                          More stores
                        </button>
                      ) : null}
                      {unmatched.suggestedActions.includes("search_manually") ? (
                        <button
                          className="scroll-mt-24 rounded border border-[#dfccb1] bg-[#fffdf8] px-2 py-1 text-xs font-semibold text-[#7a1f2b] hover:bg-[#f8eadf]"
                          onClick={() => onSearchUnmatchedNeed(unmatched.need.id)}
                          type="button"
                        >
                          Search
                        </button>
                      ) : null}
                      <button
                        className="scroll-mt-24 rounded border border-[#f0d69c] bg-[#fffdf8] px-2 py-1 text-xs font-semibold text-[#9a3412] hover:bg-[#fff4df]"
                        onClick={() => onRemoveItem(unmatched.need.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <form
            className="mt-3 border-b border-[#eadfce] pb-3"
            onSubmit={(event) => {
              event.preventDefault();
              onAddItem();
            }}
          >
            <label className="sr-only" htmlFor="add-cart-item">
              Add item
            </label>
            <div
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  closeAddItemSearch();
                }
              }}
              ref={searchWrapperRef}
            >
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a7a68]" />
                <input
                  aria-activedescendant={
                    activeSuggestion ? getAddItemSuggestionOptionId(activeSuggestion.product.id) : undefined
                  }
                  aria-autocomplete="list"
                  aria-controls={dropdownId}
                  aria-expanded={showAddItemDropdown}
                  className="h-11 w-full rounded border border-[#dfccb1] bg-[#fffdf8] pl-10 pr-3 text-sm outline-none shadow-inner shadow-[#eadfce]/30 focus:border-[#7a1f2b] focus:ring-2 focus:ring-[#7a1f2b]/15"
                  id="add-cart-item"
                  placeholder="Search grocery items"
                  role="combobox"
                  value={addItemInput}
                  onChange={(event) => {
                    onAddItemInputChange(event.target.value);
                    if (event.target.value.trim().length > 0) {
                      setIsSearchOpen(true);
                      setHighlightedIndex(0);
                    } else {
                      closeAddItemSearch();
                    }
                  }}
                  onFocus={() => {
                    if (trimmedAddItemInput.length > 0) {
                      setIsSearchOpen(true);
                      setHighlightedIndex((current) => (current < 0 ? 0 : current));
                    }
                  }}
                  onKeyDown={handleAddItemKeyDown}
                />
                {showAddItemDropdown ? (
                  <div
                    className="relative z-30 mt-1 max-h-72 overflow-auto rounded border border-[#dfccb1] bg-[#fffdf8] py-1 shadow-[0_12px_28px_rgba(63,49,44,0.14)] sm:absolute sm:left-0 sm:right-0 sm:top-full"
                    data-testid="add-item-search-dropdown"
                    id={dropdownId}
                    role="listbox"
                  >
                    {addItemSuggestions.length === 0 ? (
                      <div className="px-3 py-3 text-sm font-medium text-[#8a7a68]" role="status">
                        No matches
                      </div>
                    ) : (
                      addItemSuggestions.map((suggestion, index) => {
                        const isHighlighted = index === effectiveHighlightedIndex;

                        return (
                          <button
                            aria-selected={isHighlighted}
                            className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                              isHighlighted ? "bg-[#f8eadf]" : "bg-[#fffdf8] hover:bg-[#f8eadf]"
                            }`}
                            data-testid={`add-item-option-${suggestion.product.id}`}
                            id={getAddItemSuggestionOptionId(suggestion.product.id)}
                            key={suggestion.product.id}
                            onClick={() => addSuggestionToCart(suggestion)}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            role="option"
                            type="button"
                          >
                            <ProductThumbnail
                              alt=""
                              className="h-9 w-9"
                              image={suggestion.product.image}
                              testId="add-item-product-image"
                            />
                            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                              <span className="block min-w-0 whitespace-normal text-sm font-semibold leading-5 text-[#241b18]">
                                {suggestion.displayTitle}
                              </span>
                              <span
                                aria-hidden="true"
                                className="block shrink-0 whitespace-nowrap text-right text-xs font-medium leading-4 text-[#7b6c5e]"
                                data-testid="add-item-option-store-count"
                              >
                                {formatStoreCount(suggestion.storeCount)}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
              <button
                className="h-11 whitespace-nowrap rounded border border-dashed border-[#caa981] bg-[#fffdf8] px-1.5 text-xs font-semibold leading-none text-[#7a1f2b] transition hover:border-[#7a1f2b] hover:bg-[#f8eadf]"
                type="submit"
              >
                Add to cart
              </button>
            </div>
            {addItemError ? <p className="mt-2 text-sm font-medium text-[#9a3412]">{addItemError}</p> : null}
          </form>

          <div className="grid gap-3 py-3" data-testid="cart-line-list">
            {cart.items.map((item) => (
              <CartLineItem
                item={item}
                key={item.need.id}
                onDecrementItem={onDecrementItem}
                onIncrementItem={onIncrementItem}
                onRemoveItem={onRemoveItem}
                onSwitchAlternative={onSwitchAlternative}
              />
            ))}
          </div>

          <div className="mt-5 border-t border-[#eadfce] pt-4">
            <h3 className="text-base font-semibold text-[#241b18]">Cart summary</h3>
            <div className="mt-3 grid gap-2">
              <Total label="Items subtotal" value={`$${cart.subtotal.toFixed(2)}`} />
              <Total label={cart.fees === 0 ? "Pickup fee" : "Fees"} value={`$${cart.fees.toFixed(2)}`} />
              <Total
                label={`Estimated ${preferences.fulfillmentMode} total`}
                testId="cart-total"
                value={`$${cart.total.toFixed(2)}`}
                strong
              />
            </div>
            <p className="sr-only" data-testid="metric-stores">
              {cart.stores.length}
            </p>
            {budgetTarget > 0 ? (
              <div className="mt-4 rounded border border-[#dfccb1] bg-[#fff6f1] p-3 text-sm font-medium text-[#7a1f2b]">
                {cart.total <= budgetTarget
                  ? `You're $${(budgetTarget - cart.total).toFixed(2)} under your $${budgetTarget} budget target.`
                  : `You're $${(cart.total - budgetTarget).toFixed(2)} over your $${budgetTarget} budget target.`}
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-[1fr_1.4fr] gap-3">
              <button className="min-h-11 rounded border border-[#dfccb1] bg-[#fffdf8] text-sm font-semibold text-[#3f312c]" type="button">
                Save list
              </button>
              <button className="min-h-11 rounded bg-[#7a1f2b] text-sm font-semibold text-white" type="button">
                Checkout options
              </button>
            </div>
            <div className="mt-4 grid gap-2 rounded bg-[#fffdf8] p-3 text-sm leading-6 text-[#5d5049]">
              {cart.explanations.slice(0, 3).map((explanation, index) => (
                <p key={`${explanation}-${index}`}>{explanation}</p>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function CartLineItem({
  item,
  onDecrementItem,
  onIncrementItem,
  onRemoveItem,
  onSwitchAlternative,
}: {
  item: CartItem;
  onDecrementItem: (needId: string) => void;
  onIncrementItem: (needId: string) => void;
  onRemoveItem: (needId: string) => void;
  onSwitchAlternative: (needId: string, offerId: string) => void;
}) {
  const packageCount = getPackageCount(item.need, item.selected);
  const selectedImage = resolveOfferImage(item.selected.offer);

  return (
    <article
      className="scroll-mt-24 rounded border border-[#dfccb1] bg-[#fffdf8] p-3 shadow-[0_2px_10px_rgba(63,49,44,0.05)]"
      data-testid="cart-line-item"
      id={getCartNeedElementId(item.need.id)}
    >
      <div className="grid grid-cols-[72px_1fr_auto] gap-4 sm:grid-cols-[82px_1fr_auto]">
        <ProductThumbnail
          className="h-[72px] w-[72px] sm:h-[82px] sm:w-[82px]"
          image={selectedImage}
          testId="selected-product-image"
        />
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-[#241b18]">{item.selected.offer.name}</h3>
          <p className="mt-1 text-xs leading-5 text-[#5d5049]">
            {item.selected.offer.brand} · {item.selected.offer.packageQuantity} {item.selected.offer.packageUnit}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.selected.offer.organic ? <Badge tone="neutral">Organic</Badge> : null}
            {item.selected.offer.storeBrand ? <Badge tone="neutral">Store brand</Badge> : null}
            {getCandidateReasonLabels(item.selected).map((label) => (
              <Badge key={label} tone={getCandidateReasonTone(label)}>
                {label}
              </Badge>
            ))}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[#241b18]">${getLineTotal(item.need, item.selected).toFixed(2)}</p>
          <p className="mt-1 text-xs text-[#8a7a68]">
            ${item.selected.offer.price.toFixed(2)} / pkg
          </p>
          <p className="mt-1 text-xs text-[#8a7a68]">
            {packageCount} pkg
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center rounded border border-[#dfccb1] bg-[#fffaf2]">
          <button
            aria-label={`Decrease ${item.need.displayName}`}
            className="h-8 w-9 text-base font-semibold text-[#5d5049] transition hover:bg-[#f8eadf]"
            onClick={() => onDecrementItem(item.need.id)}
            type="button"
          >
            -
          </button>
          <span className="min-w-14 border-x border-[#dfccb1] px-3 text-center text-sm font-semibold text-[#241b18]">
            {packageCount}
          </span>
          <button
            aria-label={`Increase ${item.need.displayName}`}
            className="h-8 w-9 text-base font-semibold text-[#5d5049] transition hover:bg-[#f8eadf]"
            onClick={() => onIncrementItem(item.need.id)}
            type="button"
          >
            +
          </button>
        </div>
        <span className="text-sm font-medium text-[#5d5049]">
          {item.need.quantity} {item.need.unit}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          className="text-sm font-semibold text-[#9a3412] hover:underline"
          onClick={() => onRemoveItem(item.need.id)}
          type="button"
        >
          Remove item
        </button>
        <span className="text-xs text-[#8a7a68]">{item.selected.store.name}</span>
      </div>

      {item.alternatives.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {item.alternatives.slice(0, 3).map((alternative) => (
            <button
              className="scroll-mt-24 min-h-14 rounded border border-[#dfccb1] bg-[#fffaf2] p-2 text-left text-sm transition hover:border-[#7a1f2b] hover:bg-[#f8eadf]"
              key={alternative.offer.id}
              onClick={() => onSwitchAlternative(item.need.id, alternative.offer.id)}
              type="button"
            >
              <div className="grid grid-cols-[40px_1fr_auto] items-start gap-2">
                <ProductThumbnail
                  alt=""
                  className="h-10 w-10"
                  image={resolveOfferImage(alternative.offer)}
                  testId="substitute-product-image"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#3f312c]">{alternative.offer.brand}</p>
                  <p className="mt-0.5 truncate text-xs text-[#8a7a68]">
                    {alternative.store.name} · {getPackageCount(item.need, alternative)} pkg
                  </p>
                  <span className="mt-0.5 inline-block text-xs font-semibold text-[#7a1f2b]">Swap</span>
                </div>
                <p className="font-semibold text-[#241b18]">
                  ${getLineTotal(item.need, alternative).toFixed(2)}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ProductThumbnail({
  alt,
  className,
  image,
  testId,
}: {
  alt?: string;
  className: string;
  image: ProductImage;
  testId?: string;
}) {
  return (
    <img
      alt={alt ?? image.alt}
      className={`shrink-0 rounded border border-[#dfccb1] bg-[#fffdf8] object-contain p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65)] ${className}`}
      data-testid={testId}
      loading="lazy"
      src={image.src}
      style={{ backgroundColor: image.background }}
    />
  );
}

function getAddItemSuggestion(product: Product): AddItemSuggestion {
  return {
    product,
    displayTitle: toTitleCase(product.canonicalName),
    storeCount: getAvailableStoreCount(product.id),
  };
}

function getAvailableStoreCount(productId: string): number {
  return new Set(
    offers
      .filter((offer) => offer.productId === productId && offer.available)
      .map((offer) => offer.storeId),
  ).size;
}

function formatStoreCount(storeCount: number): string {
  return `${storeCount} ${storeCount === 1 ? "store" : "stores"}`;
}

function getAddItemSuggestionOptionId(productId: string): string {
  return `add-item-option-${productId}`;
}

const segmentClass =
  "min-h-10 rounded px-3 text-base font-semibold text-[#6f6256] transition hover:bg-[#fffdf8]/80";
const activeSegmentClass =
  "min-h-10 rounded bg-[#fffdf8] px-3 text-base font-semibold text-[#7a1f2b] shadow-sm";

function reindexNeeds(needs: GroceryNeed[]): GroceryNeed[] {
  return needs.map((need, index) => ({
    ...need,
    id: `need-${index + 1}`,
  }));
}

function cartFromPlanOption(plan: CartPlanOption, planOptions: CartPlanOption[]): OptimizedCart {
  return {
    items: plan.items,
    stores: plan.stores,
    subtotal: plan.subtotal,
    fees: plan.fees,
    total: plan.total,
    savingsEstimate: plan.savingsEstimate,
    warnings: plan.warnings,
    explanations: plan.explanations,
    activePlanId: plan.id,
    planOptions,
    scoreBreakdown: plan.scoreBreakdown,
    unmatchedNeeds: plan.unmatchedNeeds,
    status: plan.status,
  };
}

function rebuildCartFromItems(
  items: CartItem[],
  preferences: UserPreferences,
  planOptions: CartPlanOption[] = [],
): OptimizedCart {
  const stores = Array.from(
    new Map(items.map((item) => [item.selected.store.id, item.selected.store])).values(),
  );
  const subtotal = items.reduce((total, item) => total + getLineTotal(item.need, item.selected), 0);
  const fees = stores.reduce(
    (total, store) =>
      total + (preferences.fulfillmentMode === "pickup" ? store.pickupFee : store.deliveryFee),
    0,
  );
  const total = subtotal + fees;
  const storeNames = stores.map((store) => store.name).join(", ");

  return {
    items,
    stores,
    subtotal,
    fees,
    total,
    savingsEstimate: 0,
    warnings:
      preferences.budgetTarget > 0 && total > preferences.budgetTarget
        ? [`This cart is $${(total - preferences.budgetTarget).toFixed(2)} over the budget target.`]
        : [],
    explanations:
      items.length === 0
        ? ["No items are currently in this cart."]
        : [
            `Cart now uses ${stores.length} store${stores.length === 1 ? "" : "s"}: ${storeNames}.`,
            `Estimated ${preferences.fulfillmentMode} total is $${total.toFixed(2)} after your cart edits.`,
          ],
    activePlanId: "custom-edited",
    planOptions,
    scoreBreakdown: emptyScoreBreakdown,
    unmatchedNeeds: [],
    status: items.length === 0 ? "blocked" : "ready",
  };
}

function readSavedBuilderState(): PersistentBuilderState | null {
  try {
    const savedState = window.localStorage.getItem(builderStorageKey);

    if (!savedState) {
      return null;
    }

    const parsedState = JSON.parse(savedState) as PersistentBuilderState;
    const savedPreferences = { ...defaultPreferences, ...parsedState.preferences };
    const savedResults = parsedState.results
      ? (Object.fromEntries(
          Object.entries(parsedState.results).map(([resultMode, savedResult]) => [
            resultMode,
            savedResult && isRenderableSavedCart(savedResult.cart)
              ? savedResult
              : savedResult
                ? {
                    ...savedResult,
                    cart: buildOptimizedCart(savedResult.needs, savedPreferences),
                  }
                : savedResult,
          ]),
        ) as Partial<Record<BuilderMode, CartResult>>)
      : undefined;

    return {
      mode: parsedState.mode === "list" ? "list" : "meal",
      drafts: parsedState.drafts,
      preferences: savedPreferences,
      results: savedResults,
    };
  } catch {
    window.localStorage.removeItem(builderStorageKey);
    return null;
  }
}

function isRenderableSavedCart(cart?: Partial<OptimizedCart>): cart is OptimizedCart {
  if (!cart) {
    return false;
  }

  const planOptions = Array.isArray(cart.planOptions) ? cart.planOptions : [];

  return (
    Array.isArray(cart.items) &&
    Array.isArray(cart.stores) &&
    Array.isArray(cart.unmatchedNeeds) &&
    Boolean(cart.scoreBreakdown) &&
    planOptions.every(
      (plan) =>
        Array.isArray(plan.items) &&
        Array.isArray(plan.stores) &&
        Array.isArray(plan.unmatchedNeeds) &&
        Array.isArray(plan.warnings) &&
        Array.isArray(plan.explanations) &&
        Boolean(plan.scoreBreakdown),
    )
  );
}

function toTitleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function CartTopTotals({ cart }: { cart: OptimizedCart }) {
  return (
    <div
      aria-label="Top cart totals"
      className="grid min-w-28 gap-0.5 text-right text-[11px] font-semibold leading-4 text-[#8a7a68]"
    >
      <CartTopTotal label="Subtotal" value={`$${cart.subtotal.toFixed(2)}`} />
      <CartTopTotal label="Est. Fees" value={`$${cart.fees.toFixed(2)}`} />
      <span className="ml-auto h-px w-16 bg-[#cfd8d3]" aria-hidden="true" />
      <CartTopTotal label="Est. Total" value={`$${cart.total.toFixed(2)}`} />
    </div>
  );
}

function CartTopTotal({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap">
      <span>{label}: </span>
      <span className="text-[#241b18]">{value}</span>
    </span>
  );
}

function getCandidateReasonLabels(candidate: CartItem["selected"]): string[] {
  const labels = new Set<string>();
  const text = [...candidate.reasons, ...candidate.warnings].join(" ").toLowerCase();

  if (text.includes("organic") && !candidate.offer.organic) {
    labels.add("Non-organic");
  }

  if (text.includes("package")) {
    labels.add("Package fit");
  }

  if (text.includes("store brand")) {
    labels.add("Value");
  }

  if (text.includes("confidence")) {
    labels.add("Review");
  }

  if (labels.size === 0 && candidate.matchScore >= 80) {
    labels.add("Match");
  }

  return Array.from(labels).slice(0, 3);
}

function getPlanDisplayTitle(title?: string): string | undefined {
  if (title === "Cheapest one-store") {
    return "Cheapest single-store";
  }

  if (title === "Cheapest split") {
    return "Cheapest multi-store";
  }

  return title;
}

function formatPlanStores(stores: OptimizedCart["stores"]): string {
  if (stores.length === 0) {
    return "No store selected";
  }

  if (stores.length === 1) {
    return `Buy at ${stores[0].name}`;
  }

  return `Buy at ${stores.map((store) => store.name).join(" + ")}`;
}

function formatOptionComparisonSummary(summary: string): string {
  if (summary === "Lowest estimated total among the current comparable plans.") {
    return "Lowest cost option";
  }

  const deltaMatch = summary.match(/^\$(\d+\.\d{2}) more than the lowest estimated plan\.$/);

  if (deltaMatch) {
    return `+$${deltaMatch[1]} vs lowest cost`;
  }

  const compactDeltaMatch = summary.match(/^\$(\d+\.\d{2}) more than lowest cost option$/);

  if (compactDeltaMatch) {
    return `+$${compactDeltaMatch[1]} vs lowest cost`;
  }

  return summary;
}

function normalizeBadgeTone(tone: BadgeTone): "positive" | "negative" | "neutral" | "store" {
  if (tone === "warning") {
    return "negative";
  }

  if (tone === "blue") {
    return "store";
  }

  if (tone === "neutral" || tone === "purple") {
    return "neutral";
  }

  return tone === "negative" || tone === "store" ? tone : "positive";
}

function getComparisonSummaryTone(summary: string): BadgeTone {
  return summary === "Lowest cost option" ? "positive" : "neutral";
}

function getPlanCardBadges(plan: CartPlanOption): Array<{ label: string; tone: BadgeTone }> {
  const badges: Array<{ label: string; tone: BadgeTone }> = [];

  if (plan.unmatchedNeeds.length === 0) {
    badges.push({ label: "All items available", tone: "positive" });
  }

  const organicCount = getPlanOrganicCount(plan);

  if (organicCount > 0) {
    badges.push({
      label: `${organicCount} organic`,
      tone: "neutral",
    });
  }

  if (plan.scoreBreakdown.budgetFit < 100) {
    badges.push({ label: "Over budget", tone: "negative" });
  }

  return badges.slice(0, 4);
}

function getSelectedOptionWhy(plan: CartPlanOption): string[] {
  const labels: string[] = [];

  if (plan.comparisonSummary === "Lowest cost option") {
    labels.push("Lowest cost");
  }

  if (plan.fees === 0) {
    labels.push("No fee");
  }

  if (plan.stores.length === 1) {
    labels.push("One store");
  }

  if (plan.unmatchedNeeds.length === 0) {
    labels.push("All items available");
  }

  if (plan.scoreBreakdown.organicFit >= 80 && plan.items.some((item) => item.selected.offer.organic)) {
    labels.push("Organic fit");
  }

  if (plan.scoreBreakdown.brandFit >= 80 && plan.items.some((item) => !item.selected.offer.storeBrand)) {
    labels.push("Brand fit");
  }

  return labels.length > 0 ? labels.slice(0, 4) : ["Best fit"];
}

function getTradeoffBadgeTone(label: string): BadgeTone {
  return label.startsWith("Missing") || label === "Over budget" ? "negative" : "neutral";
}

function getCandidateReasonTone(label: string): BadgeTone {
  return label === "Non-organic" || label === "Review" ? "negative" : "positive";
}

function getSelectedOptionTradeoffs(plan: CartPlanOption): string[] {
  const labels: string[] = [];
  const storeBrandCount = plan.items.filter((item) => item.selected.offer.storeBrand).length;

  if (plan.stores.length > 1) {
    labels.push("More stores");
  }

  if (plan.unmatchedNeeds.length > 0) {
    labels.push(`Missing ${plan.unmatchedNeeds.length}`);
  }

  if (plan.scoreBreakdown.budgetFit < 100) {
    labels.push("Over budget");
  }

  if (getPlanOrganicCount(plan) < plan.items.length && plan.items.some((item) => item.selected.offer.organic)) {
    labels.push("Less organic");
  }

  if (storeBrandCount > 0) {
    labels.push("Store brands");
  }

  return labels.length > 0 ? labels.slice(0, 4) : ["None"];
}

function getPlanOrganicCount(plan: CartPlanOption): number {
  return plan.items.filter((item) => item.selected.offer.organic).length;
}

function getUnmatchedReasonLabel(reason: OptimizedCart["unmatchedNeeds"][number]["reason"]): string {
  if (reason === "constraint_conflict") {
    return "Constraint";
  }

  if (reason === "fulfillment_unavailable") {
    return "Fulfillment";
  }

  if (reason === "max_stores_conflict") {
    return "Max stores";
  }

  if (reason === "out_of_stock") {
    return "Out of stock";
  }

  return "No match";
}
