import type { SubstitutionPolicy } from "@/domain/grocery";
import type { InferredNeedInput } from "@/pipeline/needSchema";

export type MealProfile = {
  id: string;
  displayName: string;
  aliases: string[];
  tokenSignals: string[];
  needs: InferredNeedInput[];
  variants?: MealVariant[];
};

export type MealVariant = {
  whenAny: string[];
  replace?: Record<string, InferredNeedInput>;
  add?: InferredNeedInput[];
  warnings?: string[];
};

const shawarmaNeeds = [
  inferred("lamb", "Lamb", "meat", 1.5, "lb", 0.9, "similar"),
  inferred("pita bread", "Pita bread", "bakery", 1, "pack", 0.86, "similar"),
  inferred("white rice", "White rice", "pantry", 1, "bag", 0.78, "flexible"),
  inferred("cucumber", "Cucumber", "produce", 2, "ct", 0.84, "flexible"),
  inferred("tomatoes", "Tomatoes", "produce", 10, "oz", 0.82, "flexible"),
  inferred("red onion", "Red onion", "produce", 1, "ct", 0.8, "flexible"),
  inferred("plain yogurt", "Plain yogurt", "dairy", 1, "tub", 0.76, "similar"),
  inferred("lemon", "Lemon", "produce", 2, "ct", 0.74, "flexible"),
  inferred("garlic", "Garlic", "produce", 1, "bulb", 0.78, "flexible"),
  inferred("shawarma seasoning", "Shawarma seasoning", "pantry", 1, "jar", 0.88, "similar"),
  inferred("parsley", "Parsley", "produce", 1, "bunch", 0.7, "flexible"),
];

const cobbSaladNeeds = [
  inferred("romaine lettuce", "Romaine lettuce", "produce", 1, "pack", 0.9, "similar"),
  inferred("chicken breast", "Chicken breast", "meat", 2, "lb", 0.9, "similar"),
  inferred("eggs", "Eggs", "dairy", 6, "ct", 0.9, "similar"),
  inferred("bacon", "Bacon", "meat", 8, "oz", 0.9, "similar"),
  inferred("avocado", "Avocados", "produce", 2, "ct", 0.9, "similar"),
  inferred("tomatoes", "Tomatoes", "produce", 10, "oz", 0.9, "similar"),
  inferred("blue cheese", "Blue cheese", "dairy", 4, "oz", 0.9, "similar"),
  inferred("ranch dressing", "Ranch dressing", "pantry", 1, "bottle", 0.9, "flexible"),
];

export const mealProfiles: MealProfile[] = [
  {
    id: "shawarma",
    displayName: "Shawarma plate",
    aliases: [
      "shawarma",
      "shawarma plate",
      "shawarma bowl",
      "shawarma rice bowl",
      "shawarma wrap",
      "lamb shawarma",
      "lamb shawarma plate",
      "chicken shawarma",
      "chicken shawarma plate",
      "middle eastern lamb plate",
      "pita shawarma",
    ],
    tokenSignals: ["shawarma", "middle eastern", "pita", "garlic sauce", "yogurt sauce"],
    needs: shawarmaNeeds,
    variants: [
      {
        whenAny: ["chicken shawarma", "chicken"],
        replace: {
          lamb: inferred("chicken thighs", "Chicken thighs", "meat", 2, "lb", 0.78, "similar"),
        },
      },
    ],
  },
  {
    id: "cobb-salad",
    displayName: "Cobb salad",
    aliases: ["cobb", "cobb salad", "chicken cobb salad", "cobb salad with chicken"],
    tokenSignals: ["cobb", "salad", "romaine", "bacon", "blue cheese"],
    needs: cobbSaladNeeds,
  },
  {
    id: "tacos",
    displayName: "Taco night",
    aliases: ["tacos", "taco", "taco night", "beef tacos", "ground beef tacos"],
    tokenSignals: ["taco", "tacos", "tortillas", "salsa"],
    needs: [
      inferred("ground beef", "Ground beef", "meat", 1, "lb", 0.84, "similar"),
      inferred("tortillas", "Tortillas", "bakery", 1, "pack", 0.88, "similar"),
      inferred("shredded cheese", "Shredded cheese", "dairy", 1, "bag", 0.78, "similar"),
      inferred("tomatoes", "Tomatoes", "produce", 10, "oz", 0.7, "flexible"),
      inferred("salsa", "Salsa", "pantry", 1, "jar", 0.76, "flexible"),
    ],
  },
  {
    id: "pasta",
    displayName: "Pasta dinner",
    aliases: ["pasta", "pasta dinner", "spaghetti", "spaghetti dinner", "pasta night"],
    tokenSignals: ["pasta", "spaghetti", "marinara", "parmesan"],
    needs: [
      inferred("pasta", "Pasta", "pantry", 1, "box", 0.88, "flexible"),
      inferred("marinara sauce", "Marinara sauce", "pantry", 1, "jar", 0.82, "flexible"),
      inferred("parmesan cheese", "Parmesan cheese", "dairy", 1, "wedge", 0.74, "similar"),
    ],
  },
  {
    id: "curry",
    displayName: "Chicken curry",
    aliases: ["curry", "chicken curry", "curry rice", "curry dinner", "thai curry"],
    tokenSignals: ["curry", "coconut milk", "curry paste", "rice"],
    needs: [
      inferred("chicken thighs", "Chicken thighs", "meat", 2, "lb", 0.78, "similar"),
      inferred("coconut milk", "Coconut milk", "pantry", 2, "can", 0.8, "similar", ["dairy-free"]),
      inferred("curry paste", "Curry paste", "pantry", 1, "jar", 0.82, "similar"),
      inferred("white rice", "White rice", "pantry", 1, "bag", 0.76, "flexible"),
      inferred("bell peppers", "Bell peppers", "produce", 3, "ct", 0.68, "flexible"),
    ],
  },
  {
    id: "stir-fry",
    displayName: "Chicken stir fry",
    aliases: ["stir fry", "chicken stir fry", "stir-fry", "rice stir fry"],
    tokenSignals: ["stir fry", "stir-fry", "peppers", "rice"],
    needs: [
      inferred("chicken thighs", "Chicken thighs", "meat", 2, "lb", 0.76, "similar"),
      inferred("white rice", "White rice", "pantry", 1, "bag", 0.72, "flexible"),
      inferred("bell peppers", "Bell peppers", "produce", 3, "ct", 0.72, "flexible"),
      inferred("red onion", "Red onion", "produce", 1, "ct", 0.66, "flexible"),
      inferred("garlic", "Garlic", "produce", 1, "bulb", 0.68, "flexible"),
    ],
  },
  {
    id: "turkey-breakfast-plate",
    displayName: "Turkey breakfast plate",
    aliases: ["turkey breakfast", "turkey breakfast plate", "breakfast protein plate", "high protein breakfast"],
    tokenSignals: ["turkey breakfast", "breakfast sausage", "eggs breakfast", "protein breakfast"],
    needs: [
      inferred("eggs", "Eggs", "dairy", 6, "ct", 0.82, "similar"),
      inferred("turkey sausage", "Turkey sausage", "meat", 12, "oz", 0.82, "similar"),
      inferred("rolled oats", "Rolled oats", "pantry", 1, "box", 0.7, "flexible"),
      inferred("blueberries", "Blueberries", "produce", 1, "ct", 0.66, "flexible"),
      inferred("oat milk", "Oat milk", "dairy", 1, "carton", 0.66, "similar", ["dairy-free"]),
    ],
  },
  {
    id: "turkey-sandwich-lunch",
    displayName: "Turkey sandwich lunch",
    aliases: ["turkey sandwich", "turkey sandwich lunch", "deli turkey sandwich", "sandwich lunch"],
    tokenSignals: ["turkey sandwich", "deli turkey", "sandwich lunch"],
    needs: [
      inferred("sandwich bread", "Sandwich bread", "bakery", 1, "loaf", 0.82, "flexible"),
      inferred("deli turkey", "Deli turkey", "meat", 9, "oz", 0.82, "similar"),
      inferred("sliced cheese", "Sliced cheese", "dairy", 1, "pack", 0.72, "similar"),
      inferred("romaine lettuce", "Romaine lettuce", "produce", 1, "pack", 0.66, "flexible"),
      inferred("tomatoes", "Tomatoes", "produce", 10, "oz", 0.66, "flexible"),
      inferred("mustard", "Mustard", "pantry", 1, "bottle", 0.6, "flexible"),
    ],
  },
  {
    id: "tuna-salad-sandwich",
    displayName: "Tuna salad sandwich",
    aliases: ["tuna sandwich", "tuna salad sandwich", "tuna lunch", "tuna salad lunch"],
    tokenSignals: ["tuna sandwich", "tuna salad", "tuna lunch"],
    needs: [
      inferred("tuna", "Tuna", "pantry", 1, "can", 0.84, "similar"),
      inferred("sandwich bread", "Sandwich bread", "bakery", 1, "loaf", 0.78, "flexible"),
      inferred("mayonnaise", "Mayonnaise", "pantry", 1, "jar", 0.72, "flexible"),
      inferred("pickles", "Pickles", "pantry", 1, "jar", 0.62, "flexible"),
      inferred("romaine lettuce", "Romaine lettuce", "produce", 1, "pack", 0.58, "flexible"),
    ],
  },
  {
    id: "salmon-rice-dinner",
    displayName: "Salmon rice dinner",
    aliases: ["salmon dinner", "salmon rice dinner", "salmon rice bowl", "salmon with rice"],
    tokenSignals: ["salmon dinner", "salmon rice", "salmon bowl"],
    needs: [
      inferred("salmon", "Salmon", "seafood", 1, "lb", 0.86, "similar"),
      inferred("white rice", "White rice", "pantry", 1, "bag", 0.78, "flexible"),
      inferred("broccoli", "Broccoli", "produce", 1, "lb", 0.72, "flexible"),
      inferred("lemon", "Lemon", "produce", 2, "ct", 0.68, "flexible"),
      inferred("garlic", "Garlic", "produce", 1, "bulb", 0.64, "flexible"),
    ],
  },
  {
    id: "shrimp-stir-fry",
    displayName: "Shrimp stir fry",
    aliases: ["shrimp stir fry", "shrimp rice stir fry", "shrimp veggie stir fry"],
    tokenSignals: ["shrimp stir fry", "shrimp rice", "soy sauce stir fry"],
    needs: [
      inferred("shrimp", "Shrimp", "seafood", 12, "oz", 0.84, "similar"),
      inferred("white rice", "White rice", "pantry", 1, "bag", 0.74, "flexible"),
      inferred("bell peppers", "Bell peppers", "produce", 3, "ct", 0.72, "flexible"),
      inferred("mushrooms", "Mushrooms", "produce", 8, "oz", 0.66, "flexible"),
      inferred("soy sauce", "Soy sauce", "pantry", 1, "bottle", 0.7, "flexible"),
      inferred("garlic", "Garlic", "produce", 1, "bulb", 0.62, "flexible"),
    ],
  },
  {
    id: "tofu-veggie-stir-fry",
    displayName: "Tofu veggie stir fry",
    aliases: ["tofu stir fry", "tofu veggie stir fry", "vegan stir fry", "plant based stir fry"],
    tokenSignals: ["tofu stir fry", "veggie stir fry", "plant based stir fry"],
    needs: [
      inferred("tofu", "Tofu", "dairy", 1, "pack", 0.84, "similar", ["dairy-free"]),
      inferred("white rice", "White rice", "pantry", 1, "bag", 0.72, "flexible"),
      inferred("broccoli", "Broccoli", "produce", 1, "lb", 0.7, "flexible"),
      inferred("mushrooms", "Mushrooms", "produce", 8, "oz", 0.66, "flexible"),
      inferred("soy sauce", "Soy sauce", "pantry", 1, "bottle", 0.7, "flexible"),
      inferred("garlic", "Garlic", "produce", 1, "bulb", 0.62, "flexible"),
    ],
  },
  {
    id: "hummus-snack-plate",
    displayName: "Hummus snack plate",
    aliases: ["hummus plate", "hummus snack plate", "hummus veggie plate", "snack plate"],
    tokenSignals: ["hummus plate", "hummus snack", "veggie snack plate"],
    needs: [
      inferred("hummus", "Hummus", "deli", 1, "tub", 0.84, "flexible", ["dairy-free"]),
      inferred("pita bread", "Pita bread", "bakery", 1, "pack", 0.78, "similar"),
      inferred("cucumber", "Cucumber", "produce", 2, "ct", 0.68, "flexible"),
      inferred("baby carrots", "Baby carrots", "produce", 1, "lb", 0.68, "flexible"),
      inferred("crackers", "Crackers", "pantry", 1, "box", 0.58, "flexible"),
    ],
  },
  {
    id: "kids-lunch-box",
    displayName: "Kids lunch box",
    aliases: ["kids lunch box", "kids lunch", "school lunch box", "lunchbox snacks"],
    tokenSignals: ["kids lunch box", "school lunch", "lunchbox"],
    needs: [
      inferred("string cheese", "String cheese", "dairy", 12, "ct", 0.82, "similar"),
      inferred("apples", "Apples", "produce", 3, "lb", 0.72, "flexible"),
      inferred("crackers", "Crackers", "pantry", 1, "box", 0.72, "flexible"),
      inferred("deli turkey", "Deli turkey", "meat", 9, "oz", 0.68, "similar"),
      inferred("granola bars", "Granola bars", "pantry", 1, "box", 0.64, "flexible"),
    ],
  },
  {
    id: "oatmeal-breakfast",
    displayName: "Oatmeal breakfast",
    aliases: ["oatmeal breakfast", "oatmeal bowl", "berry oatmeal", "peanut butter oatmeal"],
    tokenSignals: ["oatmeal breakfast", "oatmeal bowl", "berry oatmeal"],
    needs: [
      inferred("rolled oats", "Rolled oats", "pantry", 1, "box", 0.86, "flexible"),
      inferred("blueberries", "Blueberries", "produce", 1, "ct", 0.72, "flexible"),
      inferred("strawberries", "Strawberries", "produce", 1, "lb", 0.72, "flexible"),
      inferred("bananas", "Bananas", "produce", 2, "lb", 0.68, "flexible"),
      inferred("peanut butter", "Peanut butter", "pantry", 1, "jar", 0.62, "flexible"),
    ],
  },
  {
    id: "black-bean-taco-bowl",
    displayName: "Black bean taco bowl",
    aliases: ["black bean taco bowl", "vegetarian taco bowl", "bean taco bowl", "black bean bowl"],
    tokenSignals: ["black bean taco", "vegetarian taco", "bean bowl"],
    needs: [
      inferred("black beans", "Black beans", "pantry", 1, "can", 0.86, "flexible", ["dairy-free"]),
      inferred("white rice", "White rice", "pantry", 1, "bag", 0.76, "flexible"),
      inferred("salsa", "Salsa", "pantry", 1, "jar", 0.72, "flexible"),
      inferred("avocado", "Avocados", "produce", 2, "ct", 0.7, "flexible"),
      inferred("shredded cheese", "Shredded cheese", "dairy", 1, "bag", 0.62, "similar"),
      inferred("tomatoes", "Tomatoes", "produce", 10, "oz", 0.62, "flexible"),
    ],
  },
];

function inferred(
  canonicalName: string,
  displayName: string,
  category: string,
  quantity: number,
  unit: string,
  confidence: number,
  substitutionPolicy: SubstitutionPolicy,
  dietaryTags: string[] = [],
): InferredNeedInput {
  return { canonicalName, displayName, category, quantity, unit, confidence, substitutionPolicy, dietaryTags };
}
