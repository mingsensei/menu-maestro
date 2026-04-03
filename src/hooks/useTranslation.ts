import { supabase } from "@/integrations/supabase/client";

export interface Translations {
  description_ko: string;
  description_ja: string;
  description_cn: string;
  description_vi: string;
  description_ru: string;
  description_kz: string;
  description_es: string;
  description_fr: string;
  description_it: string;
}

interface BatchTranslationsResponse {
  items: Translations[];
}

const MAX_RETRIES = 4;
const INITIAL_DELAY_MS = 1200;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (error: { message?: string } | null) => {
  if (!error?.message) return "Translation failed";

  const match = error.message.match(/\{.*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (typeof parsed?.error === "string") return parsed.error;
    } catch {
      return error.message;
    }
  }

  return error.message;
};

const isRateLimitError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("temporarily busy") ||
    normalized.includes("busy right now") ||
    normalized.includes("resource_exhausted")
  );
};

export const useTranslation = () => {
  const invokeTranslate = async <T,>(body: { description?: string; descriptions?: string[] }): Promise<T> => {
    let delayMs = INITIAL_DELAY_MS;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const response = await supabase.functions.invoke("translate", { body });

      if (!response.error) {
        return response.data as T;
      }

      const errorMessage = getErrorMessage(response.error);
      const shouldRetry = isRateLimitError(errorMessage) && attempt < MAX_RETRIES;

      if (shouldRetry) {
        await wait(delayMs);
        delayMs *= 2;
        continue;
      }

      if (isRateLimitError(errorMessage)) {
        throw new Error("Translation service is busy right now. Please try again in 1–2 minutes.");
      }

      throw new Error(errorMessage);
    }

    throw new Error("Translation failed after multiple retries. Please try again shortly.");
  };

  const translateDescription = async (description: string): Promise<Translations> => {
    return invokeTranslate<Translations>({ description });
  };

  const translateDescriptionsBatch = async (descriptions: string[]): Promise<Translations[]> => {
    if (descriptions.length === 0) return [];
    const response = await invokeTranslate<BatchTranslationsResponse>({ descriptions });
    return response.items || [];
  };

  return { translateDescription, translateDescriptionsBatch };
};