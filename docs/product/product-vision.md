# Product Vision

## Vision

Build an agentic grocery procurement assistant that turns a user's grocery intent into a trustworthy, editable, optimized cart across grocery stores.

The assistant should help users answer:

- What do I need?
- Which products should I choose?
- Which store or combination of stores gives me the best outcome?
- What tradeoffs am I making?
- How do I get from intent to cart with minimal friction?

## North Star

The user can say what they want in human terms, and the system produces a cart that is useful enough to review, edit, and act on.

Example:

> "Build me a week's worth of groceries for two people, mostly high-protein, under $120, using my usual breakfast items, and choose the cheapest reasonable store."

The system should turn that into structured grocery needs, compare suitable products, optimize the cart, explain tradeoffs, and let the user approve or modify the result.

## Target Users

- Busy households that repeatedly buy groceries online.
- Budget-conscious shoppers who want lower total grocery costs.
- Users who meal plan but dislike translating meals into store carts.
- Users with dietary, brand, or quality preferences who need substitutions handled carefully.
- Users deciding between delivery, pickup, and in-store shopping.

## Value Proposition

The assistant reduces grocery planning and shopping effort while improving cart quality and cost control.

It is valuable because grocery decisions are multi-variable:

- item availability changes
- prices vary by store and location
- delivery and pickup fees affect total cost
- substitutions can be acceptable or unacceptable depending on item type
- users have brand, dietary, quality, and convenience preferences

## Product Modes

### Build From Meal

The user describes a meal, dish, diet goal, or recipe. The system generates grocery needs and builds a cart.

Examples:

- "Build a cart for Cobb salad with chicken and rice."
- "I want tacos for four people."
- "Give me lunches for the week that are high protein."

### Optimize My List

The user provides a grocery list, previous cart, or recurring shopping pattern. The system compares products and stores to build the best cart.

Examples:

- "Make this list as cheap as possible."
- "Compare this grocery delivery across stores."
- "Get my usual weekly groceries but keep it under $100."

### Compare Stores

The system compares equivalent or acceptable products across stores and recommends a cart based on total value.

Examples:

- "Which store should I order from?"
- "Is Walmart or Kroger cheaper for this cart?"
- "Can you split this across two stores if it saves more than $15?"

### Replenish and Personalize

The system uses past purchases, household preferences, and pantry assumptions to rebuild carts over time.

Examples:

- "Reorder my weekly basics."
- "Skip things I probably still have."
- "Keep my usual oat milk brand, but use store brands for pantry items."

## Product Personality

The assistant should feel practical, transparent, and preference-aware. It should not behave like a black box.

Good behavior:

- "I chose Walmart because the total cart was $8.40 cheaper after pickup fees."
- "I used store-brand bacon because you marked bacon as flexible."
- "I kept your preferred oat milk brand even though it was $1.20 more."
- "Eggs were unavailable at Store A, so I used Store B for that item."

Bad behavior:

- silently swapping dietary-sensitive items
- presenting invented prices
- forcing a single retailer path
- hiding unavailable items
- over-asking clarifying questions before producing a useful draft

## Long-Term Direction

The long-term product can grow into:

- weekly grocery automation
- household pantry intelligence
- dietary-aware meal planning
- cross-store price intelligence
- subscription/replenishment workflows
- retailer handoff and cart creation
- deal and coupon-aware optimization
- budgeting and nutrition planning
