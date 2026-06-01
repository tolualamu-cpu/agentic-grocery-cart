# Exploratory Shopper Journey Catalog

This catalog captures indecisive, exploratory grocery shoppers who change their mind, compare options, try partial inputs, and mix discovery with cart optimization. Each journey is intended to be independently testable, while also contributing to combined coverage across meal inference, grocery-list matching, add-item search, cart optimization, option comparison, preferences, editing, persistence, and uncertainty handling.

## Journey Matrix

| ID | Journey | Primary Surface | Expected Result |
| --- | --- | --- | --- |
| J001 | Shopper asks for `shawarma` with no protein specified. | Meal idea | Build a shawarma cart and surface inferred needs. |
| J002 | Shopper asks for `lamb shawarma plate`. | Meal idea | Infer lamb, pita, rice, produce, yogurt/sauce, seasoning, herbs. |
| J003 | Shopper asks for `chicken shawarma plate`. | Meal idea | Use the chicken shawarma variant instead of lamb. |
| J004 | Shopper misspells `shwarma`. | Meal idea | Typo-tolerant matching should still build shawarma. |
| J005 | Shopper asks for `shawarma rice bowl`. | Meal idea | Build shawarma-style rice bowl needs. |
| J006 | Shopper asks for `pita shawarma`. | Meal idea | Keep pita/flatbread prominent in matched needs. |
| J007 | Shopper asks for `middle eastern lamb plate`. | Meal idea | Match shawarma profile with reviewable confidence. |
| J008 | Shopper asks for `cobb salad`. | Meal idea | Build Cobb salad needs. |
| J009 | Shopper asks for `chicken cobb salad`. | Meal idea | Build Cobb salad with chicken. |
| J010 | Shopper asks for `cobb salad with chicken and rice`. | Meal idea | Build Cobb salad needs plus rice. |
| J011 | Shopper asks for `tacos`. | Meal idea | Build taco-night needs. |
| J012 | Shopper asks for `ground beef tacos`. | Meal idea | Include ground beef, tortillas, cheese, tomatoes, salsa. |
| J013 | Shopper asks for `taco night`. | Meal idea | Build taco-night profile. |
| J014 | Shopper asks for `pasta dinner`. | Meal idea | Include pasta, marinara, parmesan. |
| J015 | Shopper asks for `spaghetti dinner`. | Meal idea | Match pasta dinner via alias. |
| J016 | Shopper asks for `pasta night`. | Meal idea | Match pasta dinner. |
| J017 | Shopper asks for `curry`. | Meal idea | Build curry needs. |
| J018 | Shopper asks for `chicken curry`. | Meal idea | Include chicken thighs, coconut milk, curry paste, rice, peppers. |
| J019 | Shopper asks for `thai curry`. | Meal idea | Match curry profile. |
| J020 | Shopper asks for `stir fry`. | Meal idea | Build stir-fry needs. |
| J021 | Shopper asks for `chicken stir fry`. | Meal idea | Include chicken thighs, rice, peppers, onion, garlic. |
| J022 | Shopper asks for `rice stir fry`. | Meal idea | Match stir-fry profile with rice. |
| J023 | Shopper enters `milk, bread, bananas`. | Grocery list | Match three known staples. |
| J024 | Shopper enters `milk, sandwich bread, bananas, oat milk`. | Grocery list | Match dairy and dairy-free staple needs. |
| J025 | Shopper enters `peanut butter, bread, bananas`. | Grocery list | Match pantry, bakery, produce. |
| J026 | Shopper enters `eggs, bacon, avocado`. | Grocery list | Match breakfast/Cobb-adjacent items. |
| J027 | Shopper enters `romaine, tomatoes, ranch`. | Grocery list | Match salad items. |
| J028 | Shopper enters `blue cheese, ranch dressing`. | Grocery list | Match dairy and dressing. |
| J029 | Shopper enters `oatmilk, bananas`. | Grocery list | Match alias `oatmilk`. |
| J030 | Shopper enters typo list `bananna, bred, milk`. | Grocery list | Match typo-tolerant bananas, bread, milk. |
| J031 | Shopper enters newline list with `milk`, `eggs`, `bread`. | Grocery list | Match multi-line grocery list. |
| J032 | Shopper enters `flatbread, yogurt, cucumber`. | Grocery list | Match shawarma-adjacent items via aliases. |
| J033 | Shopper enters `curry paste, coconut milk, rice`. | Grocery list | Match curry staples. |
| J034 | Shopper enters `pasta, marinara, parmesan`. | Grocery list | Match pasta staples. |
| J035 | Shopper enters `tortillas, salsa, cheddar`. | Grocery list | Match taco staples and cheese alias. |
| J036 | Shopper enters `chicken thighs, peppers, garlic`. | Grocery list | Match stir-fry/curry ingredients. |
| J037 | Shopper searches add-item `flatbread`. | Add item | Show pita bread product option. |
| J038 | Shopper searches add-item `greek yogurt`. | Add item | Show plain yogurt product option. |
| J039 | Shopper searches add-item `protein`. | Add item | Show protein-tagged products. |
| J040 | Shopper searches add-item `romaine`. | Add item | Show romaine lettuce. |
| J041 | Shopper searches add-item `lettuce`. | Add item | Show romaine lettuce through alias. |
| J042 | Shopper searches add-item `egg`. | Add item | Show eggs. |
| J043 | Shopper searches add-item `cheddar`. | Add item | Show shredded cheese. |
| J044 | Shopper searches add-item `pasta sauce`. | Add item | Show marinara sauce. |
| J045 | Shopper searches add-item `curry`. | Add item | Show curry paste. |
| J046 | Shopper searches add-item `shawarma spice`. | Add item | Show shawarma seasoning. |
| J047 | Shopper searches add-item `dairy-free`. | Add item | Show dairy-free catalog products. |
| J048 | Shopper searches add-item with empty input. | Add item | Show default addable catalog items. |
| J049 | Shopper builds Cobb salad, adds duplicate romaine. | Cart editing | Increase romaine quantity rather than creating duplicate line. |
| J050 | Shopper builds shawarma, increases lamb quantity. | Cart editing | Update quantity and total. |
| J051 | Shopper builds a list, decreases an item to removal. | Cart editing | Remove line when quantity would fall below one. |
| J052 | Shopper adds milk to a built Cobb cart. | Cart editing | Add a new matched line and update total. |
| J053 | Shopper tries to add `moon milk`. | Cart editing | Show helpful unmatched add-item error. |
| J054 | Shopper switches a cart item alternative. | Cart editing | Active item and total update; cart becomes edited. |
| J055 | Shopper removes the first item from a built cart. | Cart editing | Item count and total decrease. |
| J056 | Shopper edits the shopping brief after building. | Cart editing | Keep the current cart visible until the shopper rebuilds; do not show technical stale-copy warnings. |
| J057 | Shopper switches from meal mode to grocery list. | Mode switching | Preserve separate mode state. |
| J058 | Shopper switches back to meal mode. | Mode switching | Restore prior meal result. |
| J059 | Shopper refreshes after building shawarma. | Persistence | Preserve prompt, cart, and total. |
| J060 | Shopper refreshes after choosing a plan. | Persistence | Preserve selected plan in local state. |
| J061 | Shopper picks `cheapest` strategy for staples. | Optimizer | Favor lowest full-cart total. |
| J062 | Shopper picks `best value` with organic preference. | Optimizer | Allow higher-cost organic when value fit justifies it. |
| J063 | Shopper picks `fewest stores`. | Optimizer | Prefer one-store cart when feasible. |
| J064 | Shopper picks `preferred brands`. | Optimizer | Reduce store-brand reliance when comparable options exist. |
| J065 | Shopper sets max stores to `1`. | Optimizer | Enforce one-store cap. |
| J066 | Shopper sets max stores to `2`. | Optimizer | Allow split cart only within cap. |
| J067 | Shopper sets delivery mode. | Fulfillment | Delivery fees affect total. |
| J068 | Shopper switches back to pickup. | Fulfillment | Pickup fees and total update. |
| J069 | Shopper requires organic for `milk, eggs, bananas`. | Organic | Select organic options when available. |
| J070 | Shopper requires organic where no organic product exists. | Organic | Do not fake unavailable organic items. |
| J071 | Shopper prefers organic for eggs. | Organic | Best-value plan can select organic eggs. |
| J072 | Shopper prefers non-organic for eggs. | Organic | Prefer non-organic option. |
| J073 | Shopper has no organic preference. | Organic | Let strategy and price lead. |
| J074 | Shopper uses strict brand flexibility. | Brand | Add warnings for store-brand conflicts. |
| J075 | Shopper uses flexible brand setting. | Brand | Store brands can improve value. |
| J076 | Shopper uses balanced brand setting. | Brand | Store brand acceptable but less dominant. |
| J077 | Shopper sets very low budget for eggs. | Budget | Budget warning appears and lower-cost plan is favored. |
| J078 | Shopper sets roomy budget for eggs. | Budget | Quality/value preferences can still win. |
| J079 | Shopper sets zero budget target. | Budget | Disable budget warning pressure. |
| J080 | Shopper compares `recommended` vs `best value`. | Option comparison | Cards show grocery cost, fees, estimated total, store pills, and compact tradeoffs. |
| J081 | Shopper chooses `best value` option. | Option comparison | Editable cart updates to best-value selection. |
| J082 | Shopper chooses `cheapest single-store` option. | Option comparison | Active cart uses that option. |
| J083 | Shopper chooses `fewest stores` option. | Option comparison | Active cart uses fewest-store option. |
| J084 | Shopper chooses `preferred brands` option. | Option comparison | Active cart reflects brand-aware option. |
| J085 | Shopper compares multi-store vs single-store when both exist. | Option comparison | Store pill and totals explain the cost/store tradeoff without extra repeated chips. |
| J086 | Shopper builds `surprise feast from saturn`. | Uncertainty | Show uncertainty state and do not create fake cart. |
| J087 | Shopper enters manual `moon milk`. | Uncertainty | Return no matched needs. |
| J088 | Shopper asks for vague `healthy lunches`. | Uncertainty | Avoid fake cart if no reliable profile. |
| J089 | Shopper asks for `sauce`. | Ambiguity | Avoid overconfident full cart. |
| J090 | Shopper asks for `chicken`. | Ambiguity | In meal mode, require clearer meal context or template match. |
| J091 | Shopper enters `rice` in grocery list. | Manual list | Match white rice. |
| J092 | Shopper enters `rice` as meal idea. | Meal idea | Match known rice need but not pretend a full recipe. |
| J093 | Shopper enters `cheap shawarma`. | Meal idea | Still infer shawarma, with optimizer preference handled separately later. |
| J094 | Shopper enters `best value tacos`. | Meal idea | Match tacos and rely on preference controls for ranking. |
| J095 | Shopper enters extra punctuation: `pasta!!! dinner??`. | Search | Normalize punctuation and match pasta. |
| J096 | Shopper enters mixed case: `CHICKEN CURRY`. | Search | Normalize case and match curry. |
| J097 | Shopper enters extra whitespace around `stir fry`. | Search | Normalize whitespace and match stir fry. |
| J098 | Shopper enters duplicate list items `eggs, eggs`. | Manual list | Keep one need line that can be quantity-edited. |
| J099 | Shopper enters `milk, unknown asteroid fruit`. | Manual list | Keep matched milk and ignore unsupported term. |
| J100 | Shopper enters `bread, bread, bread`. | Manual list | Keep one bread need line. |
| J101 | Shopper starts with grocery list, then explores add-item catalog. | Combined | Existing cart remains while add-item suggestions update. |
| J102 | Shopper changes organic preference after building. | Combined | Rebuild cart with new organic selection. |
| J103 | Shopper changes fulfillment after switching plan. | Combined | Rebuild cart and plan options with new fee assumptions. |
| J104 | Shopper changes brand flexibility after comparing plans. | Combined | Active/recommended plan recalculates. |
| J105 | Shopper changes budget after comparing plans. | Combined | Warnings and tradeoffs update without blocking cart. |
| J106 | Shopper adds an item after selecting best-value plan. | Combined | Cart becomes custom edited and remains reviewable. |
| J107 | Shopper switches alternative after selecting a plan. | Combined | Cart becomes custom edited and total updates. |
| J108 | Shopper removes item after selecting an option. | Combined | Option comparison remains visible but active cart is custom. |
| J109 | Shopper uses delivery with strict brands and organic required. | Combined | Hard constraints and fees remain consistent. |
| J110 | Shopper uses cheapest with non-organic preference and tight budget. | Combined | Ranking leans low-cost/non-organic while explaining budget. |

## Automation Strategy

- Data-driven unit tests execute the full inference-to-cart pipeline for the journey catalog where the behavior is deterministic.
- Existing Playwright tests cover UI-critical journeys such as refresh persistence, mode switching, cart editing, add-item errors, preference changes, and plan switching.
- Future live-retailer phases should reuse the same journey IDs, but expected values will shift from mock catalog offers to connector-backed offers.
