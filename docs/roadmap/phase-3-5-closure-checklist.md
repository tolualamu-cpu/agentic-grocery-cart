# Phase 3.5 Closure Checklist

Status: complete — validated July 16, 2026.

## Scope

Phase 3.5 expands semantic search without live OpenAI inference, embeddings, retailer APIs, or API-backed product data.

The goal is to make the existing MVP search foundation broader and more scalable while preserving the current cart optimizer contract:

```text
Input -> GroceryNeeds -> Product Candidates -> Optimized Cart -> Review
```

## Search Strategy Decision

Phase 3.5 uses deterministic ontology-based retrieval.

This means search combines:

- exact canonical and alias matching
- typo-tolerant fuzzy matching
- category and subcategory matching
- dietary, usage, and semantic tags
- candidate merging with explainable match reasons

## Tradeoff: Ontology Retrieval vs Mock Embeddings

Ontology retrieval is chosen now because it is:

- deterministic
- explainable
- easy to test with fixture expectations
- independent of OpenAI/API connectivity
- aligned with the current mock catalog and optimizer

Mock embeddings are deferred because they could create a false sense of production semantic quality. A fake vector layer would prove a future interface, but it would still depend on hand-authored similarity fixtures and could overfit the test examples.

Real embeddings remain a future migration path after the catalog and query evaluation suite are large enough to justify vector retrieval.

## Explicit Exclusions

Do not add in Phase 3.5:

- `OpenAIIntentInterpreter`
- live OpenAI API calls
- real embedding generation
- retailer connectors
- live product prices or availability
- new grouped search UX

## Completed Behaviors Required

- Catalog contains 100-150 structured mock products.
- Product records support category, subcategory, aliases, tags, semantic tags, and stable dietary tags.
- Search uses composable retrievers for lexical, fuzzy, and taxonomy signals.
- Search candidates merge reasons and warnings without breaking existing callers.
- Product matching routes through the expanded search/index abstraction.
- The mock catalog is available as a readable `/catalog` table with downloadable product and offer CSV files.
- Expanded meal profiles use the broader catalog without changing the core optimizer contract.
- Existing meal inference, grocery-list matching, add-item search, unsupported states, and cart optimization behavior do not regress.
- Current UX remains minimal; improved search appears through better results, not a new search surface.

## No-Regression Rule

The original Phase 2.5 search evaluation fixtures are protected baseline cases.

Do not weaken or remove them unless product behavior intentionally changes and the change is documented.

Protected examples include:

- Cobb salad, shawarma, tacos, pasta, curry, stir fry
- `shwarma`, `spagetti`, `romain`, `letuce`, `avacado`, `bananna`
- `flatbread`, `greek yogurt`, `cheddar`, `pasta sauce`, `oatmilk`
- `dairy free milk`, `dary free milk`, `lactose free milk`
- unsupported inputs such as `moon milk`, `saturn feast`, and `asteroid crackers`

## Required Tests

- Search evaluation suite has at least 130 cases after the expanded meal-profile pass.
- Unit tests cover exact, alias, typo, category, semantic-tag, dietary, vague, unsupported, and ambiguous cases.
- Unit tests cover all 10 expanded meal profiles.
- Product matcher tests prove taxonomy candidates can become cart candidates without changing optimizer contracts.
- E2E tests add at least 18 shopper journeys across Meal idea, Grocery list, and Add item, plus cart-building checks for the expanded meal profiles.
- Historical unit and E2E tests remain intact.
- Full gate must pass:

```bash
npm run test:all
```

## Closure Evidence

- The protected search evaluation suite contains 130 cases, including all required result classes.
- The expanded catalog, taxonomy retrievers, product matcher, catalog exports, 10 meal profiles, and 18 Phase 3.5 shopper journeys are covered by automated tests.
- The complete historical gate passed on July 16, 2026: lint completed with no errors, 457 unit tests passed, 146 end-to-end tests passed, and the production build completed successfully.
- Phase 4 remains blocked pending the user review required below.

## Review Gate

After `npm run test:all` passes, stop for user review before adding OpenAI intent interpretation, embeddings, API connections, or retailer connectors.
