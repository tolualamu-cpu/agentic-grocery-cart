import { describe, expect, it } from "vitest";
import {
  deterministicSearchService,
  normalizeText,
  type SearchDocument,
} from "@/pipeline/search";

type TestPayload = {
  id: string;
};

const documents: Array<SearchDocument<TestPayload>> = [
  {
    id: "meal-shawarma",
    type: "meal_profile",
    canonicalName: "shawarma",
    displayName: "Shawarma plate",
    aliases: ["shawarma", "lamb shawarma plate", "chicken shawarma"],
    tags: ["middle eastern", "pita", "garlic sauce"],
    payload: { id: "meal-shawarma" },
  },
  {
    id: "product-shawarma-seasoning",
    type: "product",
    canonicalName: "shawarma seasoning",
    displayName: "Shawarma seasoning",
    aliases: ["shawarma spice"],
    category: "pantry",
    tags: ["spice"],
    payload: { id: "product-shawarma-seasoning" },
  },
  {
    id: "product-pita",
    type: "product",
    canonicalName: "pita bread",
    displayName: "Pita bread",
    aliases: ["flatbread"],
    category: "bakery",
    tags: ["flatbread"],
    payload: { id: "product-pita" },
  },
];

describe("DeterministicSearchService", () => {
  it("normalizes punctuation, whitespace, and case", () => {
    expect(normalizeText("  Lamb-Shawarma!! Plate ")).toBe("lamb shawarma plate");
  });

  it("classifies meal surface queries as meal intent", () => {
    const query = deterministicSearchService.understandQuery("shawarma", { surface: "meal_idea" });

    expect(query.intent).toBe("meal");
    expect(query.normalizedTokens).toEqual(["shawarma"]);
  });

  it("ranks meal profiles first in meal context", () => {
    const [topCandidate] = deterministicSearchService.search("shawarma", documents, {
      surface: "meal_idea",
    });

    expect(topCandidate.document.id).toBe("meal-shawarma");
    expect(topCandidate.reasons.length).toBeGreaterThan(0);
  });

  it("ranks product documents first in add-item context", () => {
    const [topCandidate] = deterministicSearchService.search("shawarma", documents, {
      surface: "add_item",
    });

    expect(topCandidate.document.id).toBe("product-shawarma-seasoning");
  });

  it("handles typo-tolerant matching", () => {
    const [topCandidate] = deterministicSearchService.search("shwarma", documents, {
      surface: "meal_idea",
    });

    expect(topCandidate.document.id).toBe("meal-shawarma");
    expect(topCandidate.reasons[0]).toContain("Typo-tolerant");
  });

  it("matches aliases and tags", () => {
    expect(
      deterministicSearchService.search("flatbread", documents, { surface: "add_item" })[0].document.id,
    ).toBe("product-pita");

    expect(
      deterministicSearchService.search("middle eastern", documents, { surface: "meal_idea" })[0].document.id,
    ).toBe("meal-shawarma");
  });
});
