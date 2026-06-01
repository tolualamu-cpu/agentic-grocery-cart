# System Architecture

## Architectural Principle

Build around a stable grocery intelligence pipeline:

```text
User Input
  -> Intent Engine
  -> Grocery Need Normalizer
  -> Product Matching
  -> Store Connectors
  -> Cart Optimizer
  -> Explanation Layer
  -> User Review
  -> Retailer Handoff
```

The durable internal object is `GroceryNeed`. Recipes, manual lists, past purchases, pantry data, and meal plans all produce grocery needs.

## Core Domain Objects

### GroceryNeed

Represents something the user needs to buy.

```ts
type GroceryNeed = {
  id: string;
  canonicalName: string;
  category: string;
  quantity: number;
  unit: string;
  constraints: {
    organic?: boolean;
    brandPreference?: string[];
    dietaryTags?: string[];
    substitutionPolicy: "strict" | "similar" | "flexible";
    maxPrice?: number;
  };
  source: "recipe" | "manual_list" | "past_cart" | "meal_plan" | "replenishment";
  confidence: number;
};
```

### Product

Represents a canonical product concept independent of retailer.

Examples:

- boneless skinless chicken breast
- romaine lettuce
- whole milk
- long grain white rice

### Offer

Represents a retailer-specific purchasable item.

Examples:

- Walmart Tyson Boneless Skinless Chicken Breast, 2.25 lb
- Kroger Simple Truth Chicken Breast, 1.8 lb
- Target Good & Gather Long Grain Rice, 5 lb

### ProductCandidate

Represents an offer that may satisfy a grocery need.

```ts
type ProductCandidate = {
  needId: string;
  offerId: string;
  storeId: string;
  matchScore: number;
  price: number;
  quantityCoverage: number;
  available: boolean;
  reasons: string[];
  warnings: string[];
};
```

### CartSession

Represents a user-facing cart-building workflow.

Includes:

- user input
- generated grocery needs
- candidate products
- selected cart items
- optimization goal
- preferences
- explanations
- approval state

## Services

### Intent Service

Turns natural-language user requests into structured tasks.

Example task types:

- recipe_cart
- optimize_list
- compare_stores
- replenish_cart
- budget_cart

### Need Normalization Service

Converts raw inputs into canonical grocery needs.

Responsibilities:

- ingredient decomposition
- duplicate merging
- unit normalization
- serving-size adjustment
- category assignment
- dietary tag propagation
- substitution policy assignment

### Need Generation Service

Generates `GroceryNeed[]` from user input before product matching.

Phase 1 may use templates and deterministic keyword matching. Phase 2 should add model-assisted inference so meals that are not hardcoded can still produce useful grocery needs.

Example:

```text
"I want a lamb shawarma plate"
  -> lamb
  -> pita or flatbread
  -> rice
  -> cucumber
  -> tomato
  -> red onion
  -> plain yogurt or garlic sauce
  -> lemon
  -> garlic
  -> shawarma seasoning
  -> parsley
```

Recommended interface:

```ts
interface NeedGenerator {
  generate(input: string, context: UserPreferences): Promise<GroceryNeed[]>;
}
```

Expected implementations:

- `TemplateNeedGenerator` for known meals and test fixtures
- `ModelNeedGenerator` for model-backed inference
- `HybridNeedGenerator` to use templates first and fall back to the model

Model output must be parsed through a strict schema and validated before entering the product matching layer.

### Product Matching Service

Maps grocery needs to product candidates.

Responsibilities:

- query generation
- semantic matching
- package size comparison
- brand and dietary filtering
- candidate scoring
- confidence and warning generation

Phase 2 should define the product matching interface and deterministic ranking features over the targeted mock catalog. Phase 3.5 should add embedding-backed semantic matching for the broader canonical product catalog, using embeddings to map model-inferred needs like "lamb for shawarma" to relevant product concepts such as lamb shoulder, ground lamb, or lamb leg steak before scoring retailer offers.

### Search Service

Provides the scalable search and ranking layer shared by meal input, manual list parsing, add-item product search, catalog matching, and future retailer search.

Recommended interface:

```ts
interface SearchService {
  understandQuery(input: string, context: SearchContext): QueryUnderstanding;
  retrieveCandidates(query: QueryUnderstanding, context: SearchContext): SearchCandidate[];
  rankCandidates(candidates: SearchCandidate[], context: SearchContext): RankedCandidate[];
}
```

Search context should include where the query came from:

- meal idea
- grocery list
- add-item product search
- price optimization
- retailer connector search
- personalized recurring cart

The same words may rank differently depending on context. For example, "shawarma" in the meal idea flow should favor a meal profile and grocery need generation, while "shawarma" in add-item search should favor individual products such as shawarma seasoning, pita, or lamb.

Candidate generation should combine multiple retrievers:

- exact match
- alias match
- token match
- category and tag match
- fuzzy and typo-tolerant match
- meal profile match
- embedding-backed semantic match once the catalog grows
- retailer search results once connectors are live
- personalized history once household memory exists

Ranking should be explainable from structured features:

```text
score =
  lexical relevance
  + semantic relevance
  + intent fit
  + category fit
  + dietary and preference fit
  + availability
  + package and quantity fit
  + price and value fit
  + personalization fit
  - ambiguity penalty
  - substitution risk
  - out-of-stock penalty
```

Development staging:

- Phase 2: define the `SearchService` abstraction, search context, deterministic normalization, ranked candidates, and meal-profile/product-search foundations.
- Phase 2.5: add fuzzy matching, singular/plural normalization, context-aware ranking, ambiguity handling, and a search evaluation fixture suite.
- Phase 3.5: add broad catalog search infrastructure, canonical taxonomy, enrichment pipelines, and embeddings or a dedicated search index.
- Phase 4: add live retailer-aware search through `StoreConnector` adapters.
- Phase 5: add personalized search and learned ranking from household history and preferences.

Search must fail honestly. Unsupported, ambiguous, contradictory, or low-confidence input should produce a clarifying question, partial-match state, or unmatched warning rather than silently creating fake grocery needs.

### Grocery Intent Interpreter

Interprets open-ended user language before need generation and product matching.

Recommended interface:

```ts
interface GroceryIntentInterpreter {
  interpret(input: string, context: SearchContext): Promise<GroceryIntentInterpretation>;
}
```

The interpreter should return structured data such as:

- core item or meal query
- input mode
- dietary constraints
- organic or non-organic preference
- price or value intent
- fulfillment hints
- ambiguity or clarification needs
- confidence and warnings

Phase 2.5 should define this as a replaceable interface with deterministic and mock/model-like behavior so the local MVP can handle constrained and typo-prone inputs without live APIs.

Current MVP implementations:

- `DeterministicGroceryIntentInterpreter` for exact local rules
- `MockModelGroceryIntentInterpreter` for API-free semantic typo and synonym fixtures
- `HybridGroceryIntentInterpreter` to merge deterministic certainty with mock/model-like interpretation

Phase 3.5 should add live OpenAI intent understanding through an `OpenAIIntentInterpreter`, using the latest generally available GPT model and Structured Outputs. Model output must be schema validated and may interpret language only; deterministic catalog, store, pricing, availability, and optimizer layers remain the source of truth for purchasable products, fees, totals, and cart decisions.

### Store Connector Layer

Retailer integrations must be isolated behind a common interface.

```ts
interface StoreConnector {
  searchProducts(query: ProductSearchQuery): Promise<ProductCandidate[]>;
  getAvailability(productId: string, location: Location): Promise<Availability>;
  getPrice(productId: string, location: Location): Promise<Price>;
  createCart?(items: CartItem[]): Promise<CartHandoff>;
}
```

Connector implementations may use official APIs, affiliate feeds, cached catalogs, approved partner integrations, or browser-assisted user handoff where appropriate.

Retailer-specific behavior must not leak into the core optimizer.

### Cart Optimizer

Builds candidate carts and ranks them against user preferences.

Optimization goals:

- cheapest
- best_value
- fewest_stores
- fastest_delivery
- preferred_brands

Initial scoring model:

```text
score =
  priceWeight * totalCost
  + distanceWeight * distance
  + substitutionPenalty
  + unavailablePenalty
  + extraStorePenalty
  + preferenceMismatchPenalty
```

The scoring model can evolve, but decisions should remain explainable.

Phase 3 is split into two parts:

- Phase 3A: optimizer correctness. Every current preference control must change cart scoring, filtering, totals, or warnings in a predictable and tested way before new comparison UI is added.
- Phase 3B: store and cart option comparison UX. After optimizer correctness is proven, expose multiple cart options visually and let the user compare and switch between them.

Phase 3A expected behavior:

- `cheapest` minimizes full cart total, including item prices and fulfillment fees.
- `best_value` balances price, match quality, package fit, availability, organic preference, brand flexibility, and store count.
- `fewest_stores` prioritizes the smallest number of stores, then price.
- `preferred_brands` gives more weight to brand/preference fit than pure cost.
- `max stores` is a hard cap on selected stores.
- pickup vs delivery changes fees and filters stores by fulfillment eligibility.
- organic required filters non-organic candidates and surfaces unmatched items when necessary.
- organic prefer boosts organic candidates without forcing them.
- brand flexibility affects substitution strictness and store-brand ranking.
- budget target creates accurate warnings immediately and may later influence ranking.
- preference changes rebuild the current cart or clearly mark it stale.

Phase 3B expected behavior:

- compare cart options visually
- explain tradeoffs for price, fees, selected stores, availability, organic constraints, and substitutions with compact labels
- let the user switch strategies or options
- preserve cart editing after a plan switch
- show cheapest single-store, cheapest multi-store, fewest-store, and best-value options when available

### Explanation Service

Generates user-facing explanations from structured decision data.

It should explain:

- selected store
- selected product
- substitutions
- unavailable items
- price tradeoffs
- preference tradeoffs

## AI Usage

Use LLMs for:

- intent parsing
- recipe and meal decomposition
- model-assisted grocery need generation
- clarifying question generation
- product match reasoning support
- user-facing explanation drafting

Do not use LLMs as source of truth for:

- prices
- availability
- fees
- cart totals
- purchase completion

All monetary and availability data must come from deterministic services or trusted data sources.

Recommended AI technologies:

- OpenAI Responses API for structured model calls
- Structured Outputs with Zod schemas for `GroceryNeed[]`
- latest generally available GPT model as the default model for meal and grocery inference
- centralized model configuration so future upgrades can move from the current latest model to the next latest model without touching pipeline logic
- optional lower-cost GPT variant only when the product explicitly chooses a latency or cost tradeoff
- `text-embedding-3-small` for cost-efficient semantic catalog matching
- `text-embedding-3-large` for higher-quality semantic matching when needed
- OpenAI Agents SDK later, when workflows require multiple production tools, handoffs, and tracing

Model boundary:

```text
Model:
  infer grocery needs
  classify constraints
  identify uncertainty
  draft explanations

Deterministic services:
  product availability
  prices
  fees
  cart totals
  store ranking
  final retailer handoff
```

## Workflow Shape

The system should use controlled multi-step workflows rather than one giant autonomous agent.

```text
1. Parse user request
2. Generate grocery needs
3. Normalize needs
4. Search product candidates
5. Score product candidates
6. Build cart options
7. Explain tradeoffs
8. Ask for user approval
9. Hand off to retailer
```

Each step should produce structured output, be logged, and be testable.

## Extensibility Rules

- New input modes should output `GroceryNeed[]`.
- New retailers should implement `StoreConnector`.
- New optimization strategies should operate on the same candidate and cart data structures.
- New user preferences should be represented in the preference model, not hardcoded into prompts.
- Cart decisions should be auditable from structured data.
