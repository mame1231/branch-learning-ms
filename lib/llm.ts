import OpenAI, { AzureOpenAI } from "openai";

// 優先順位: Azure OpenAI → OpenAI → Groq（フォールバック）
export function getLLMClient(): OpenAI {
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
    return new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: "2025-01-01-preview",
    });
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

export function getLLMModel(): string {
  if (process.env.AZURE_OPENAI_API_KEY) {
    return process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini";
  }
  if (process.env.OPENAI_API_KEY) {
    return "gpt-4o-mini";
  }
  return "llama-3.3-70b-versatile";
}
