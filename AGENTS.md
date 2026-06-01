# Agentic Shopping Working Context

Before making product, architecture, or implementation decisions in this repository, read these documents:

1. [Project Context](docs/context/project-context.md)
2. [Product Vision](docs/product/product-vision.md)
3. [Product Requirements](docs/product/requirements.md)
4. [System Architecture](docs/architecture/system-architecture.md)
5. [Infrastructure Plan](docs/architecture/infrastructure.md)
6. [MVP Roadmap](docs/roadmap/mvp-roadmap.md)
7. [Phase Gates](docs/roadmap/phase-gates.md)
8. [Design Guidelines](docs/product/design-guidelines.md)

Core principle: build a grocery intelligence pipeline around `GroceryNeed`, not around recipes, individual retailers, or scraped product pages.

Default product pipeline:

```text
Input -> GroceryNeeds -> Product Candidates -> Optimized Cart -> Review -> Retailer Handoff
```

Important constraints:

- Recipes are one input mode, not the center of the product.
- User review and approval come before purchase or retailer handoff.
- Prices, availability, fees, and totals must come from deterministic data sources, not LLM invention.
- Retailer integrations belong behind connector interfaces.
- User preferences and optimization logs are core infrastructure.
- Use the latest generally available GPT model for model-backed development and inference by default. Do not hardcode an older model as the default if a newer GPT model is available; centralize model names in configuration so upgrades such as GPT-5.5 to GPT-5.6 are a config change.
- Complete phases sequentially. If an earlier phase is not closed, pause net-new later-phase expansion and close the earlier phase gate first.
- Never mark a phase or major feature complete unless all new tests and all historical unit and e2e tests pass. The default completion gate is `npm run test:all`.
- Keep the UX calm and scannable. Prefer compact labels and one- to two-word descriptors for non-major UI items, especially pills, tags, metadata, and repeated controls.
- For every issue or feature request, diagnose the root cause and product capability behind the specific example. Remedy and test the extensible capability class, not only the one reported string, item, click path, or visual defect.
