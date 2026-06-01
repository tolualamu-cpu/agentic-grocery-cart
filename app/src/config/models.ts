export const modelConfig = {
  groceryInferenceModel: process.env.NEXT_PUBLIC_GROCERY_INFERENCE_MODEL ?? "latest-gpt",
  embeddingModel: process.env.NEXT_PUBLIC_GROCERY_EMBEDDING_MODEL ?? "text-embedding-3-small",
};
