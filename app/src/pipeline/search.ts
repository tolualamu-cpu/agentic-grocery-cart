export type SearchSurface = "meal_idea" | "grocery_list" | "add_item" | "product_matching";

export type SearchIntent = "meal" | "list" | "product_search" | "optimize" | "constraint" | "ambiguous";

export type SearchDocumentType = "meal_profile" | "need_template" | "product";

export type SearchContext = {
  surface: SearchSurface;
  limit?: number;
};

export type QueryUnderstanding = {
  rawInput: string;
  normalizedQuery: string;
  normalizedTokens: string[];
  intent: SearchIntent;
  confidence: number;
  warnings: string[];
};

export type SearchDocument<TPayload = unknown> = {
  id: string;
  type: SearchDocumentType;
  canonicalName: string;
  displayName: string;
  aliases: string[];
  category?: string;
  subcategory?: string;
  tags: string[];
  semanticTags?: string[];
  dietaryTags?: string[];
  rank?: number;
  payload: TPayload;
};

export type RankedSearchCandidate<TPayload = unknown> = {
  document: SearchDocument<TPayload>;
  score: number;
  reasons: string[];
  warnings: string[];
  matchedTerms: string[];
};

export interface SearchService {
  understandQuery(input: string, context: SearchContext): QueryUnderstanding;
  retrieveCandidates<TPayload>(
    query: QueryUnderstanding,
    documents: Array<SearchDocument<TPayload>>,
    context: SearchContext,
  ): Array<RankedSearchCandidate<TPayload>>;
  rankCandidates<TPayload>(
    candidates: Array<RankedSearchCandidate<TPayload>>,
    query: QueryUnderstanding,
    context: SearchContext,
  ): Array<RankedSearchCandidate<TPayload>>;
  search<TPayload>(
    input: string,
    documents: Array<SearchDocument<TPayload>>,
    context: SearchContext,
  ): Array<RankedSearchCandidate<TPayload>>;
}

const optimizationSignals = new Set(["best", "cheap", "cheapest", "budget", "deal", "deals", "value", "optimize"]);
const constraintSignals = new Set([
  "organic",
  "nonorganic",
  "non",
  "dairy",
  "free",
  "gluten",
  "pickup",
  "delivery",
  "under",
  "less",
]);
const genericMealSignals = new Set(["breakfast", "lunch", "dinner", "meal", "meals", "healthy", "cheap", "budget", "easy"]);
const genericItemSignals = new Set([
  "beef",
  "chicken",
  "fish",
  "protein",
  "rice",
  "salad",
  "sauce",
  "vegetable",
  "vegetables",
  "veggie",
  "veggies",
  "vegetabl",
  "veggi",
]);
const stopWords = new Set([
  "a",
  "an",
  "and",
  "build",
  "buy",
  "cart",
  "for",
  "food",
  "foods",
  "get",
  "grocery",
  "groceries",
  "i",
  "items",
  "make",
  "me",
  "need",
  "please",
  "stuff",
  "things",
  "the",
  "to",
  "want",
  "with",
]);
const listSeparators = /,|\n/;

export class DeterministicSearchService implements SearchService {
  understandQuery(input: string, context: SearchContext): QueryUnderstanding {
    const normalizedQuery = normalizeText(input);
    const rawTokens = tokenize(normalizedQuery);
    const normalizedTokens = removeStopWords(rawTokens, context.surface);
    const intent = inferIntent(input, rawTokens, context);

    return {
      rawInput: input,
      normalizedQuery,
      normalizedTokens,
      intent,
      confidence: normalizedQuery ? 0.72 : 0,
      warnings: getQueryWarnings(normalizedQuery, rawTokens, intent),
    };
  }

  retrieveCandidates<TPayload>(
    query: QueryUnderstanding,
    documents: Array<SearchDocument<TPayload>>,
    context: SearchContext,
  ): Array<RankedSearchCandidate<TPayload>> {
    if (!query.normalizedQuery) {
      return documents.slice(0, context.limit ?? 8).map((document) => ({
        document,
        score: 1,
        reasons: ["Default catalog result."],
        warnings: [],
        matchedTerms: [],
      }));
    }

    return mergeRetrieverCandidates([
      lexicalRetriever(query, documents, context),
      fuzzyRetriever(query, documents, context),
      taxonomyRetriever(query, documents, context),
    ]).filter((candidate) => candidate.score >= minimumScoreFor(context.surface));
  }

  rankCandidates<TPayload>(
    candidates: Array<RankedSearchCandidate<TPayload>>,
    query: QueryUnderstanding,
    context: SearchContext,
  ): Array<RankedSearchCandidate<TPayload>> {
    const sortedCandidates = candidates
      .map((candidate) => applyContextRanking(candidate, query, context))
      .filter((candidate) => !query.normalizedQuery || candidate.score >= minimumScoreFor(context.surface))
      .sort(
        (a, b) =>
          b.score - a.score ||
          documentTypeOrder(a.document.type, context.surface) - documentTypeOrder(b.document.type, context.surface) ||
          (a.document.rank ?? 0) - (b.document.rank ?? 0) ||
          a.document.canonicalName.localeCompare(b.document.canonicalName),
      );

    return markAmbiguity(sortedCandidates).slice(0, context.limit ?? 8);
  }

  search<TPayload>(
    input: string,
    documents: Array<SearchDocument<TPayload>>,
    context: SearchContext,
  ): Array<RankedSearchCandidate<TPayload>> {
    const query = this.understandQuery(input, context);
    return this.rankCandidates(this.retrieveCandidates(query, documents, context), query, context);
  }
}

export const deterministicSearchService = new DeterministicSearchService();

function inferIntent(input: string, tokens: string[], context: SearchContext): SearchIntent {
  if (tokens.length === 0) {
    return "ambiguous";
  }

  const hasOptimization = tokens.some((token) => optimizationSignals.has(token));
  const hasConstraint =
    tokens.some((token) => constraintSignals.has(token)) ||
    /\$\s*\d+|\bunder\s+\d+|\bless than\s+\d+/.test(input.toLowerCase());

  if (listSeparators.test(input)) {
    return "list";
  }

  if (context.surface === "meal_idea") {
    if (isAmbiguousMealQuery(tokens)) {
      return "ambiguous";
    }

    if (hasOptimization) {
      return "optimize";
    }

    return hasConstraint ? "constraint" : "meal";
  }

  if (context.surface === "grocery_list") {
    return "list";
  }

  if (context.surface === "add_item" || context.surface === "product_matching") {
    return hasConstraint || hasOptimization ? "constraint" : "product_search";
  }

  return tokens.length <= 2 ? "ambiguous" : "product_search";
}

function isAmbiguousMealQuery(tokens: string[]): boolean {
  const hasGenericMealIntent = tokens.some((token) => genericMealSignals.has(token));
  const hasSpecificMealSignal = tokens.some(
    (token) =>
      !genericMealSignals.has(token) &&
      !genericItemSignals.has(token) &&
      !stopWords.has(token) &&
      !/^\d+$/.test(token) &&
      token !== "four",
  );
  const onlyGenericItem = tokens.length <= 2 && tokens.some((token) => genericItemSignals.has(token));

  return (hasGenericMealIntent && !hasSpecificMealSignal) || onlyGenericItem;
}

function getQueryWarnings(normalizedQuery: string, tokens: string[], intent: SearchIntent): string[] {
  if (!normalizedQuery) {
    return ["Search query is empty."];
  }

  if (intent === "ambiguous") {
    return ["Search query may need more context."];
  }

  if (tokens.some((token) => constraintSignals.has(token))) {
    return ["Search query includes preference or constraint terms."];
  }

  return [];
}

function lexicalRetriever<TPayload>(
  query: QueryUnderstanding,
  documents: Array<SearchDocument<TPayload>>,
  context: SearchContext,
): Array<RankedSearchCandidate<TPayload>> {
  return documents.map((document) => scoreDocument(document, query, context, "lexical"));
}

function fuzzyRetriever<TPayload>(
  query: QueryUnderstanding,
  documents: Array<SearchDocument<TPayload>>,
  context: SearchContext,
): Array<RankedSearchCandidate<TPayload>> {
  return documents
    .map((document) => scoreDocument(document, query, context, "fuzzy"))
    .filter((candidate) => candidate.reasons.some((reason) => reason.includes("Typo-tolerant")));
}

function taxonomyRetriever<TPayload>(
  query: QueryUnderstanding,
  documents: Array<SearchDocument<TPayload>>,
  context: SearchContext,
): Array<RankedSearchCandidate<TPayload>> {
  return documents.map((document) => scoreTaxonomyDocument(document, query, context));
}

function scoreDocument<TPayload>(
  document: SearchDocument<TPayload>,
  query: QueryUnderstanding,
  context: SearchContext,
  retriever: "lexical" | "fuzzy",
): RankedSearchCandidate<TPayload> {
  const searchableFields = [
    { value: document.canonicalName, label: "canonical name", weight: 100 },
    { value: document.displayName, label: "display name", weight: 88 },
    ...document.aliases.map((alias) => ({ value: alias, label: "alias", weight: 82 })),
    ...document.tags.map((tag) => ({ value: tag, label: "tag", weight: 48 })),
    ...(document.category ? [{ value: document.category, label: "category", weight: 38 }] : []),
  ];
  const reasons: string[] = [];
  const matchedTerms = new Set<string>();
  let score = 0;

  for (const field of searchableFields) {
    const normalizedField = normalizeText(field.value);
    const fieldTokens = tokenize(normalizedField);
    const fuzzyScore = fuzzyTokenScore(query.normalizedTokens, fieldTokens);

    if (normalizedField === query.normalizedQuery) {
      score = Math.max(score, field.weight + 6);
      reasons.push(`Exact ${field.label} match.`);
      matchedTerms.add(normalizedField);
    } else if (query.normalizedTokens.includes(normalizedField)) {
      score = Math.max(score, field.weight);
      reasons.push(`Exact ${field.label} token match.`);
      matchedTerms.add(normalizedField);
    } else if (containsPhrase(query.normalizedQuery, normalizedField)) {
      score = Math.max(score, Math.round(field.weight * 0.76));
      reasons.push(`Query includes ${field.label}.`);
      matchedTerms.add(normalizedField);
    } else if (containsPhrase(normalizedField, query.normalizedQuery)) {
      score = Math.max(score, Math.round(field.weight * 0.82));
      reasons.push(`Close ${field.label} phrase match.`);
      matchedTerms.add(query.normalizedQuery);
    } else if (fieldTokens.length > 1 && query.normalizedTokens.every((token) => fieldTokens.includes(stemToken(token)))) {
      score = Math.max(score, Math.round(field.weight * 0.68));
      reasons.push(`All query terms matched ${field.label}.`);
      query.normalizedTokens.forEach((token) => matchedTerms.add(token));
    } else if (retriever === "fuzzy" && fuzzyScore >= 0.7) {
      score = Math.max(score, Math.round(field.weight * fuzzyScore * 0.72));
      reasons.push(`Typo-tolerant ${field.label} match.`);
      query.normalizedTokens.forEach((token) => matchedTerms.add(token));
    } else if (query.normalizedTokens.some((token) => fieldTokens.includes(stemToken(token)))) {
      score = Math.max(score, Math.round(field.weight * 0.32));
      reasons.push(`Some query terms matched ${field.label}.`);
      query.normalizedTokens
        .filter((token) => fieldTokens.includes(stemToken(token)))
        .forEach((token) => matchedTerms.add(token));
    }
  }

  const contextBoost = documentTypeBoost(document.type, context.surface, query.intent);

  return {
    document,
    score: Math.min(100, score + contextBoost),
    reasons: uniqueStrings(reasons),
    warnings: [],
    matchedTerms: Array.from(matchedTerms),
  };
}

function scoreTaxonomyDocument<TPayload>(
  document: SearchDocument<TPayload>,
  query: QueryUnderstanding,
  context: SearchContext,
): RankedSearchCandidate<TPayload> {
  const taxonomyFields = [
    { value: document.category, label: "Category", weight: 42 },
    { value: document.subcategory, label: "Subcategory", weight: 52 },
    ...document.tags.map((tag) => ({ value: tag, label: "Tag", weight: 56 })),
    ...(document.semanticTags ?? []).map((tag) => ({ value: tag, label: "Related use", weight: 62 })),
    ...(document.dietaryTags ?? []).map((tag) => ({ value: tag, label: "Dietary fit", weight: 68 })),
  ].filter((field): field is { value: string; label: string; weight: number } => Boolean(field.value));
  const reasons: string[] = [];
  const matchedTerms = new Set<string>();
  const matchedQueryTokens = new Set<string>();
  let score = 0;

  for (const field of taxonomyFields) {
    const normalizedField = normalizeText(field.value);
    const fieldTokens = tokenize(normalizedField);
    const fieldMatchedTokens = query.normalizedTokens.filter(
      (token) => fieldTokens.includes(stemToken(token)) || containsPhrase(normalizedField, token),
    );

    if (fieldMatchedTokens.length === 0) {
      continue;
    }

    fieldMatchedTokens.forEach((token) => {
      matchedTerms.add(token);
      matchedQueryTokens.add(token);
    });

    if (fieldMatchedTokens.length === query.normalizedTokens.length) {
      score = Math.max(score, field.weight + 16);
      reasons.push(`${field.label} match.`);
    } else {
      score = Math.max(score, field.weight + fieldMatchedTokens.length * 6);
      reasons.push(`${field.label} signal.`);
    }
  }

  if (matchedQueryTokens.size > 1 && matchedQueryTokens.size === query.normalizedTokens.length) {
    score = Math.max(score, 78);
    reasons.push("Semantic tag match.");
  } else if (matchedQueryTokens.size > 1) {
    score = Math.max(score, 64);
    reasons.push("Related taxonomy match.");
  }

  return {
    document,
    score: Math.min(100, score + documentTypeBoost(document.type, context.surface, query.intent)),
    reasons: uniqueStrings(reasons),
    warnings: [],
    matchedTerms: Array.from(matchedTerms),
  };
}

function mergeRetrieverCandidates<TPayload>(
  candidateGroups: Array<Array<RankedSearchCandidate<TPayload>>>,
): Array<RankedSearchCandidate<TPayload>> {
  const merged = new Map<string, RankedSearchCandidate<TPayload>>();

  for (const candidate of candidateGroups.flat()) {
    const existing = merged.get(candidate.document.id);

    if (!existing) {
      merged.set(candidate.document.id, candidate);
      continue;
    }

    merged.set(candidate.document.id, {
      ...existing,
      score: Math.max(existing.score, candidate.score) + Math.min(8, Math.round(candidate.score * 0.08)),
      reasons: uniqueStrings([...existing.reasons, ...candidate.reasons]),
      warnings: uniqueStrings([...existing.warnings, ...candidate.warnings]),
      matchedTerms: uniqueStrings([...existing.matchedTerms, ...candidate.matchedTerms]),
    });
  }

  return Array.from(merged.values()).map((candidate) => ({
    ...candidate,
    score: Math.min(100, candidate.score),
  }));
}

function applyContextRanking<TPayload>(
  candidate: RankedSearchCandidate<TPayload>,
  query: QueryUnderstanding,
  context: SearchContext,
): RankedSearchCandidate<TPayload> {
  const warnings = [...candidate.warnings];
  let score = candidate.score;
  const normalizedTags = candidate.document.tags.map(normalizeText);
  const matchedTermTokens = new Set(candidate.matchedTerms.flatMap(tokenize));
  const unmatchedTokens = query.normalizedTokens.filter(
    (token) =>
      !matchedTermTokens.has(token) &&
      !constraintSignals.has(token) &&
      !optimizationSignals.has(token) &&
      !/^\d+$/.test(token),
  );

  if (context.surface === "meal_idea" && candidate.document.type !== "meal_profile") {
    score -= 18;
    warnings.push("This result is an item match, not a full meal match.");
  }

  if (context.surface === "add_item" && candidate.document.type === "meal_profile") {
    score -= 30;
    warnings.push("Meal profiles are deprioritized in item search.");
  }

  if (context.surface === "add_item" && candidate.document.type === "need_template") {
    score -= 36;
    warnings.push("Need templates are secondary in item search.");
  }

  if (query.intent === "optimize" && candidate.document.type === "product") {
    score -= 12;
    warnings.push("Optimization requests need a broader list or saved cart context.");
  }

  if (query.normalizedQuery.includes("dairy free") && normalizedTags.includes("dairy free")) {
    score += 30;
  }

  if (query.normalizedQuery.includes("dairy free") && candidate.document.type === "product" && !normalizedTags.includes("dairy free")) {
    score -= 35;
    warnings.push("Product does not carry the requested dairy-free signal.");
  }

  if (query.normalizedQuery.includes("gluten free") && normalizedTags.includes("gluten free")) {
    score += 30;
  }

  if (query.normalizedQuery.includes("gluten free") && candidate.document.type === "product" && !normalizedTags.includes("gluten free")) {
    score -= 35;
    warnings.push("Product does not carry the requested gluten-free signal.");
  }

  if (query.intent === "ambiguous") {
    warnings.push("This query may need more context.");
  }

  if (query.normalizedTokens.length > 1 && unmatchedTokens.length > 0) {
    const isMealProfileSearch = context.surface === "meal_idea" && candidate.document.type === "meal_profile";

    score -= unmatchedTokens.length * (isMealProfileSearch ? 8 : 70);
    warnings.push(`Unmatched query terms: ${unmatchedTokens.join(", ")}.`);

    const hasStrongMealNameMatch = candidate.reasons.some((reason) =>
      /Exact .* match|Exact .* token match|Query includes|Close .* phrase match|All query terms matched/.test(reason),
    );

    if (isMealProfileSearch && !hasStrongMealNameMatch) {
      score = Math.min(score, 40);
    }

    if (!isMealProfileSearch && unmatchedTokens.some((token) => !/^\d+$/.test(token))) {
      score = 0;
    }
  }

  return {
    ...candidate,
    score: Math.max(0, Math.min(100, score)),
    warnings,
  };
}

function markAmbiguity<TPayload>(
  candidates: Array<RankedSearchCandidate<TPayload>>,
): Array<RankedSearchCandidate<TPayload>> {
  const [first, second] = candidates;

  if (!first || !second || first.score - second.score > 8) {
    return candidates;
  }

  return [
    {
      ...first,
      warnings: [
        ...first.warnings,
        `Close alternative also matched: ${second.document.displayName}.`,
      ],
    },
    ...candidates.slice(1),
  ];
}

function documentTypeBoost(type: SearchDocumentType, surface: SearchSurface, intent: SearchIntent): number {
  if (surface === "meal_idea" && type === "meal_profile") {
    return intent === "meal" ? 14 : 6;
  }

  if (surface === "add_item" && type === "product") {
    return 12;
  }

  if (surface === "grocery_list" && type === "need_template") {
    return 10;
  }

  if (surface === "product_matching" && type === "product") {
    return 8;
  }

  return 0;
}

function documentTypeOrder(type: SearchDocumentType, surface: SearchSurface): number {
  const preferredTypes: Record<SearchSurface, SearchDocumentType[]> = {
    meal_idea: ["meal_profile", "need_template", "product"],
    grocery_list: ["need_template", "product", "meal_profile"],
    add_item: ["product", "need_template", "meal_profile"],
    product_matching: ["product", "need_template", "meal_profile"],
  };

  return preferredTypes[surface].indexOf(type);
}

function minimumScoreFor(surface: SearchSurface): number {
  return surface === "meal_idea" ? 45 : 28;
}

function fuzzyTokenScore(queryTokens: string[], fieldTokens: string[]): number {
  if (queryTokens.length === 0 || fieldTokens.length === 0) {
    return 0;
  }

  const matchedScores = queryTokens.map((queryToken) => {
    const stemmedQueryToken = stemToken(queryToken);
    const bestDistance = Math.min(
      ...fieldTokens.map((fieldToken) => editDistance(stemmedQueryToken, fieldToken)),
    );
    const longestLength = Math.max(stemmedQueryToken.length, ...fieldTokens.map((fieldToken) => fieldToken.length), 1);
    const bestScore = 1 - bestDistance / longestLength;

    if (
      stemmedQueryToken.length <= 4 &&
      !fieldTokens.some((fieldToken) => fieldToken.startsWith(stemmedQueryToken[0] ?? ""))
    ) {
      return Math.min(bestScore, 0.4);
    }

    return bestScore;
  });

  const minimumTokenScore = queryTokens.length === 1 ? 0.7 : 0.74;

  if (matchedScores.some((score) => score < minimumTokenScore)) {
    return 0;
  }

  return matchedScores.reduce((total, value) => total + value, 0) / matchedScores.length;
}

function editDistance(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));

  for (let row = 0; row <= left.length; row += 1) {
    rows[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    rows[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;

      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  return rows[left.length][right.length];
}

function tokenize(value: string): string[] {
  return value
    .split(" ")
    .map(stemToken)
    .filter(Boolean);
}

function removeStopWords(tokens: string[], surface: SearchSurface): string[] {
  const filteredTokens = tokens.filter(
    (token) => !stopWords.has(token) && (surface !== "meal_idea" || !genericMealSignals.has(token)),
  );

  return filteredTokens.length > 0 ? filteredTokens : tokens;
}

function stemToken(value: string): string {
  if (value === "vegetables") {
    return "vegetable";
  }

  if (value === "veggies") {
    return "veggie";
  }

  if (value.endsWith("ies") && value.length > 4) {
    return `${value.slice(0, -3)}y`;
  }

  if (value.endsWith("es") && value.length > 4) {
    return value.slice(0, -2);
  }

  if (value.endsWith("s") && value.length > 3) {
    return value.slice(0, -1);
  }

  return value;
}

function containsPhrase(normalizedInput: string, normalizedPhrase: string): boolean {
  return ` ${normalizedInput} `.includes(` ${normalizedPhrase} `);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
