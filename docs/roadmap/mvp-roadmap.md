# MVP Roadmap

## Phase 1: Local Catalog Prototype

Goal: Validate the user experience without depending on live retailer data.

Build:

- app shell
- Build From Meal flow
- Optimize My List flow
- seeded grocery catalog
- mock stores
- preference controls
- generated grocery needs
- editable cart review
- basic cart optimization

Success criteria:

- a user can enter a meal and receive an editable cart
- a user can enter a grocery list and receive a cheaper or better-value cart
- both workflows use the same internal grocery need pipeline

## Phase 2: Model-Ready Need Generation, Search Foundations, And Product Matching

Goal: move beyond hardcoded meal templates while laying the search and ranking architecture that future catalog, retailer, model, and personalization work can plug into.

Build:

- mock-first model-ready meal and intent inference
- `NeedGenerator` interface with template, model, and hybrid implementations
- structured model output into `GroceryNeed[]`
- model confidence and uncertainty handling
- clarifying-question triggers for ambiguous meals or constraints
- `SearchService` abstraction for query understanding, candidate retrieval, and ranking
- search context types so the same query can behave differently in meal creation, product add-item search, and future optimization flows
- deterministic query normalization
- data-driven meal profiles with aliases, signals, variants, and warnings
- ranked candidate objects with scores, reasons, and uncertainty flags
- canonical product model
- offer model
- deterministic product retrieval by canonical name, alias, category, and tag
- product candidate scoring
- quantity and package-size logic
- confidence labels
- alternatives and substitutions
- dietary and brand filters
- per-item "why this item?" explanations
- unmatched item handling

Success criteria:

- the system can infer needs for meals through reusable meal profiles, such as shawarma, lamb shawarma plate, chicken shawarma, tacos, pasta dinner, curry, stir fry, and Cobb salad
- brief or partial meal inputs like "shawarma" can produce a reliable cart when confidence is high enough
- model output is validated against a strict grocery need schema
- the model does not invent prices, availability, fees, or totals
- the system can explain why each product was selected
- the user can swap selected products for alternatives
- strict substitutions are respected
- unsupported or low-confidence input produces a useful uncertainty state instead of a fake cart
- cart state persists through refresh during the local prototype

Recommended technologies:

- OpenAI Responses API for meal and intent inference
- Structured Outputs with Zod schemas for `GroceryNeed[]`
- latest generally available GPT model as the default inference model
- centralized model configuration so future model upgrades are config changes, not code rewrites
- optional lower-cost GPT variant only when explicitly chosen for latency or cost tradeoffs
- `text-embedding-3-small` for cost-efficient MVP semantic matching
- `text-embedding-3-large` for higher-quality matching when needed
- explicit backend workflow functions before introducing the Agents SDK
- OpenAI Agents SDK later, once the product has multiple production tools and connector handoffs

## Phase 2.5: Search And Ranking Quality Layer

Goal: make the MVP search behavior resilient to realistic user input without depending on live APIs or a broad retailer catalog.

Build:

- `SearchService` implementations wired into meal input and add-item product search
- intent classification for meal, grocery list, product search, optimization, constraints, and ambiguity
- model-ready `GroceryIntentInterpreter` interface and schema-validated `GroceryIntentInterpretation`
- mock/model-like intent interpretation fixtures for semantic typo and synonym cases across meal idea, grocery list, and add-item search
- fuzzy and typo-tolerant matching for common grocery terms and meal names
- singular/plural and light stemming normalization
- context-aware ranking so "shawarma" in Meal idea favors a meal profile, while "shawarma" in Add item favors products like shawarma seasoning or pita when appropriate
- multi-retriever candidate generation:
  - exact match
  - alias match
  - token match
  - category/tag match
  - fuzzy match
  - meal profile match
- explainable ranking features for lexical relevance, semantic-like relevance, category fit, intent fit, dietary fit, availability, package fit, price/value, and substitution risk
- ambiguity handling for inputs like "chicken", "rice", "sauce", or "healthy lunches"
- unmatched and partial-match states
- search evaluation fixture set covering at least 50 inputs across happy paths and edge cases
- constraint-understanding fixture set covering at least 50 additional inputs across meal idea, grocery list, and add-item search

Success criteria:

- at least 50 representative user inputs are covered by automated tests
- the fixture set includes meal discovery, typos, aliases, ambiguous short inputs, add-item product search, multi-intent or constraint-heavy inputs, and unsupported inputs
- typo, partial, alias, ambiguous, unsupported, and multi-intent inputs land in the correct state
- search quality improves through ranking features rather than hardcoded one-off strings
- meal generation, product add-item search, and future optimization flows share the same search vocabulary and scoring concepts
- every returned result can explain why it matched
- semantic/constraint interpretation is routed through a replaceable interface rather than a growing parser tied to individual grocery items
- Phase 2.5 and Phase 3.5 remain API-free; live OpenAI intent understanding belongs after Phase 3.5 review.

## Phase 3A: Optimizer Correctness

Goal: make the current optimizer and preference controls correct, predictable, and testable before adding store-comparison UI.

Build:

- true cart-level optimizer
- separate item candidate ranking from cart plan ranking
- generate multiple internal cart plans before selecting the recommended cart
- preference-aware cart scoring for:
  - cheapest
  - best value
  - fewest stores
  - preferred brands
- enforce `max stores`
- make pickup vs delivery affect fees and store eligibility
- make organic required, organic preferred, and non-organic preferred affect product selection correctly
- make brand flexibility affect substitutions and store-brand ranking
- make budget target act as a soft requirement that influences warnings, explanations, and ranking pressure without blocking cart creation
- rebuild the cart or clearly mark it stale when preferences change
- improve optimizer explanations so the user sees why a cart was chosen
- unit tests for every current preference setting
- e2e tests showing preference changes produce predictable cart changes

Success criteria:

- changing preferences changes cart results in predictable ways
- the selected cart matches the chosen optimization strategy
- current settings are meaningful before any new store comparison surface is added
- fees, totals, store count, organic/non-organic selection, brand flexibility, and budget warnings are accurate
- tests cover preference combinations as a matrix, not only one-off happy paths
- the required [Phase 3A Test Plan](phase-3a-test-plan.md) is implemented and passing

## Phase 3B: Store And Cart Option Comparison UX

Goal: expose the optimizer's cart options visually after Phase 3A proves the underlying optimizer is trustworthy.

Build:

- full-cart comparison across Walmart, Target, and Kroger mock catalogs
- visual cart option comparison view
- cheapest single-store cart
- cheapest multi-store cart
- fewest-store cart
- best-value cart
- compact store and fee tradeoff display
- explain tradeoffs between price, fulfillment fees, availability, organic requirements, and brand/substitution preferences without adding repeated verbose pills
- let the user switch between strategies or cart options without losing their current input
- preserve editable cart behavior after switching plans
- improve explanations so the user sees why each option exists and why the recommended option was chosen

Success criteria:

- the user can compare tradeoffs before accepting the cart
- the user can switch strategies/options and see the selected cart update
- the comparison UI reflects the same optimizer logic tested in Phase 3A
- store comparison does not hide unmatched, unavailable, or preference-conflicting items

Implementation note:

- Phase 3B is now represented in the local MVP by named optimizer options, including recommended, cheapest single-store, cheapest multi-store when available, fewest stores, best value, and preferred brands.
- The UI exposes these options in a comparison section with grocery cost, fees, estimated total, store pills, budget-relative tradeoffs, and option-switching behavior.
- Manual cart editing remains available after a plan is selected.
- Phase 3B comparison cards must reflect Phase 3A optimizer statuses. Partial or blocked carts must keep unmatched item context visible across every cart option and after option switching.
- Extra gain/loss explanation chips were considered and intentionally deferred because the current concise option cards and selected-option breakdown satisfy MVP decision support without adding visual clutter.

## Phase 3.5: Catalog And Semantic Search Expansion

Goal: grow from targeted mock proof meals to a broader canonical grocery catalog.

Build:

- larger canonical product taxonomy
- catalog import and enrichment pipeline
- product aliases, categories, dietary tags, and package metadata
- search index abstraction over canonical products and grocery needs
- candidate merge logic across lexical, fuzzy, category, dietary, usage, and semantic-tag retrievers
- migration path from deterministic alias scoring to embedding-backed matching
- deterministic ontology-based retrieval across lexical, fuzzy, category, dietary, usage, and semantic-tag signals
- no live OpenAI intent understanding in this phase
- no mock, generated, or API-backed embeddings in this phase
- document the migration path to a future `OpenAIIntentInterpreter` and Structured Outputs
- deterministic schema validation before catalog search, product matching, and cart optimization
- optional search infrastructure evaluation, such as Postgres full-text plus pgvector, Typesense, Meilisearch, OpenSearch, or Elasticsearch

Success criteria:

- model-inferred needs can match a broader product universe without hand-coding every meal
- open-ended user language, typo-heavy constraints, and semantic synonyms can be interpreted without expanding a hand-maintained lexicon for every new product
- matching quality remains testable and explainable
- catalog expansion does not change the cart optimizer contract
- search quality can be measured with a reusable query/result evaluation suite

## Phase 4: Real Retailer Connectors

Goal: Integrate live or near-live product data behind connector interfaces.

Build:

- first real store connector
- price and availability refresh
- product URL handoff
- connector error handling
- cache freshness labels
- retailer-aware search adapters behind the same search interface
- live availability and price ranking features
- store-specific product title normalization
- optional `OpenAIModelNeedGenerator` replacement for the Phase 2 mock generator if live model inference is prioritized before retailer handoff

Success criteria:

- the system can use real product data without changing the core cart pipeline
- connector failures do not break the whole workflow
- search can combine canonical catalog matches with retailer-specific offers, prices, availability, and handoff URLs

## Phase 5: Personalization

Goal: Make carts better over time.

Build:

- household profile
- recurring grocery items
- brand preference memory
- substitution memory
- pantry assumptions
- budget preferences
- past cart import if available
- personalized search and ranking features based on household defaults, purchase history, disliked substitutions, dietary rules, preferred brands, and recurring items

Success criteria:

- the system can rebuild a weekly cart with fewer user inputs
- the system preserves known preferences and explains tradeoffs
- search results improve for the individual household without hiding why a result was chosen

## Future AI And Agentic Work

- Live OpenAI API integration comes after the Phase 2 mock-first inference path proves the `NeedGenerator` interface. It should replace `MockModelNeedGenerator` with `OpenAIModelNeedGenerator` while preserving schema validation before cart optimization.
- The latest generally available GPT model should be selected through centralized configuration, not hardcoded in pipeline logic.
- OpenAI Agents SDK should wait until the product has multiple real tools, such as model inference, catalog search, retailer connectors, and cart handoff, so orchestration and tracing solve a real workflow problem.

## Recommended MVP UI

The first app should have two primary workflows:

- Build From Meal
- Optimize My List

Both should end in the same Cart Review screen.

Cart Review should include:

- selected items
- quantities
- stores
- prices
- confidence
- alternatives
- reasons
- warnings
- total cost
- approval or export action

## Key Technical Debt To Avoid

- hardcoding recipe-specific flows
- hardcoding Walmart or any single retailer into the core pipeline
- letting LLM output become price or availability truth
- skipping preference modeling
- skipping optimization logs
- hiding unavailable or low-confidence matches
- building purchase automation before trusted review workflows
