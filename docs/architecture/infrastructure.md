# Infrastructure Plan

## Recommended Early Stack

Frontend:

- Next.js / React
- Tailwind CSS or shadcn/ui
- Cart review, comparison, preference settings, and workflow UI

Backend:

- Node.js with Fastify or NestJS
- TypeScript
- PostgreSQL
- Prisma or Drizzle
- Redis for cached search, price, and availability data
- Background jobs with BullMQ, Inngest, or Temporal

AI:

- LLM calls for intent parsing, meal decomposition, and explanation
- Structured outputs for agent steps
- Deterministic code for pricing, totals, and optimization

Search and Matching:

- Postgres full-text search for MVP
- Embeddings for fuzzy product matching
- Later: OpenSearch, Elasticsearch, or a dedicated vector database if scale requires it

Deployment:

- Vercel, Fly.io, or Render for early app hosting
- Supabase or managed Postgres for early database
- S3-compatible object storage for snapshots and logs

## Environments

Start with:

- local
- staging
- production

Staging should be used for testing retailer connectors and optimization behavior before exposing changes to real users.

## Data Storage

Core tables:

- users
- households
- user_preferences
- stores
- store_locations
- products
- product_offers
- grocery_needs
- cart_sessions
- cart_items
- product_matches
- recipes
- past_purchases
- optimization_runs

Important modeling distinction:

```text
Product = canonical item
Offer = retailer-specific sellable item
```

This distinction is essential for comparing equivalent items across stores.

## Caching

Retailer search, price, and availability data should be cached with short TTLs.

Suggested cache categories:

- product search results
- offer details
- price snapshots
- availability snapshots
- store metadata
- optimization inputs

Prices and availability must show freshness when displayed to users.

## Background Jobs

Use background jobs for:

- retailer searches across multiple stores
- price refreshes
- availability checks
- optimization runs
- importing product catalogs
- embedding products
- generating cart explanations

## Observability

Log every optimization run with:

- input
- grocery needs
- user preferences
- candidate products
- selected products
- rejected products
- scoring details
- final cart
- explanation payload

This is necessary for debugging, trust, and later model improvement.

## Connector Strategy

Retailer connectors should be treated as replaceable adapters.

Possible data sources:

- official retailer APIs
- partner APIs
- product feeds
- affiliate networks
- user-provided cart data
- browser-assisted handoff

Avoid building the core system around scraping a single retailer. Retailer integrations are likely to be unstable and may have legal, terms-of-service, authentication, and bot-detection constraints.

## Security And Privacy

Sensitive data may include:

- addresses
- grocery habits
- dietary restrictions
- household composition
- payment-adjacent retailer account data

Requirements:

- store only needed data
- encrypt sensitive fields where appropriate
- avoid storing payment credentials
- support account deletion
- separate user identity from optimization logs where possible
- require user approval before retailer handoff or purchase

## Scalability Notes

The likely scaling bottlenecks are:

- retailer search latency
- product matching quality
- price and availability freshness
- optimization complexity across many stores
- user trust in substitutions

Design implications:

- connector calls should run asynchronously
- results should stream progressively where useful
- matching should be cached and reusable
- optimization should be deterministic and explainable
- failed connector calls should degrade gracefully
