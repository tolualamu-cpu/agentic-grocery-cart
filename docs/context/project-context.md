# Project Context

## Purpose

This repository is for building an agentic grocery shopping assistant. The assistant helps users turn grocery intent into reviewed, editable, optimized carts.

The product should support recipe-based cart building, but recipes are only one input mode. The broader product is a grocery procurement assistant that helps users get the groceries they want with less friction, better prices, and better fit to their preferences.

## Core Product Thesis

Users do not only need a shopping list. They need help making purchasing decisions across a messy grocery ecosystem:

- What should I buy for this meal?
- Which products match what I meant?
- Which store has the best total cart value?
- Which substitutions are acceptable?
- Which items should preserve brand, dietary, or quality preferences?
- Should I order delivery, pickup, or shop in person?

The system should behave like a trusted cart-building agent that remains transparent and lets the user approve decisions before purchase.

## Primary Use Cases

1. Recipe or meal cart builder
   - Example: "Build me a grocery cart for Cobb salad with chicken and rice."
   - The system decomposes the meal into grocery needs, maps those needs to store products, and proposes a cart.

2. Weekly grocery optimizer
   - Example: "Get my usual weekly groceries as cheaply as possible."
   - The system uses a saved list, past carts, household preferences, and store availability to optimize a recurring grocery order.

3. Price matching and store comparison
   - Example: "Compare this list across Walmart, Target, Kroger, and Instacart."
   - The system compares full basket cost, not just individual prices.

4. Deal-aware cart builder
   - Example: "Build a high-protein grocery cart under $100."
   - The system considers sales, store brands, bulk pricing, and flexible substitutions.

5. Substitution assistant
   - Example: "Use any brand for pantry items, but keep organic eggs and lactose-free milk."
   - The system distinguishes flexible needs from strict needs.

6. Replenishment assistant
   - Example: "Reorder what I usually buy, but skip anything I bought last week."
   - The system learns recurring items, purchase cadence, and household defaults.

## Product Framing

The product should be built around the concept of a `GroceryNeed`, not around recipes, retailer pages, or scraped search results.

Recipes, manual shopping lists, past carts, pantry data, and meal plans are all input sources that generate grocery needs.

Retailer products, offers, carts, and shopping lists are outputs derived from those needs.

## Non-Negotiable Product Principles

- User review and approval come before purchase.
- The system must not invent prices, availability, or retailer fees.
- The assistant should explain important cart decisions.
- Store integrations must be isolated behind connector interfaces.
- User preferences are core infrastructure, not a later personalization feature.
- Optimization should consider total cart value, including fees, store count, substitutions, delivery/pickup options, and quality preferences.
- Budget targets are soft guidance: they should shape ranking and explanations, while still letting the user review carts that are over target when the tradeoff is justified.
- Preference test fixtures must include real choice sets, such as organic and non-organic alternatives, so ranking behavior can be proven instead of assumed.
- The system must support future input modes without rewriting the core cart pipeline.

## Important Vocabulary

- Grocery intent: The user's natural-language shopping goal.
- Grocery need: A normalized internal representation of something the user needs to buy.
- Product: A canonical grocery product concept.
- Offer: A retailer-specific purchasable item with price, availability, location, and fulfillment context.
- Candidate: A possible offer that could satisfy a grocery need.
- Cart session: A user-facing shopping workflow containing needs, matches, recommendations, and user decisions.
- Optimization run: A logged attempt to build the best cart given inputs, preferences, and current data.
- Retailer handoff: The transition from the assistant's reviewed cart into a retailer-owned cart, list, or checkout flow.
