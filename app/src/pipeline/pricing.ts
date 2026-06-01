import type { GroceryNeed, ProductCandidate } from "@/domain/grocery";

const packageLikeUnits = new Set([
  "pack",
  "bottle",
  "bag",
  "loaf",
  "jar",
  "carton",
  "tub",
  "bulb",
  "bunch",
  "box",
  "wedge",
  "can",
]);

export function getPackageCount(need: GroceryNeed, candidate: ProductCandidate): number {
  if (packageLikeUnits.has(need.unit)) {
    return Math.max(need.quantity, 1);
  }

  if (need.unit === candidate.offer.packageUnit) {
    return Math.max(1, Math.ceil(need.quantity / candidate.offer.packageQuantity));
  }

  return Math.max(need.quantity, 1);
}

export function getLineTotal(need: GroceryNeed, candidate: ProductCandidate): number {
  return getPackageCount(need, candidate) * candidate.offer.price;
}

export function getNeedQuantityForPackageCount(
  need: GroceryNeed,
  candidate: ProductCandidate,
  packageCount: number,
): number {
  const nextPackageCount = Math.max(1, packageCount);

  if (packageLikeUnits.has(need.unit)) {
    return nextPackageCount;
  }

  if (need.unit === candidate.offer.packageUnit) {
    return roundQuantity(nextPackageCount * candidate.offer.packageQuantity);
  }

  return nextPackageCount;
}

function roundQuantity(value: number): number {
  return Number(value.toFixed(2));
}
