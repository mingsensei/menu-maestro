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

const MAX_RETRIES = 4;
const INITIAL_DELAY_MS = 1200;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const translateDescription = async (description: string): Promise<Translations> => {
    let delayMs = INITIAL_DELAY_MS;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const response = await supabase.functions.invoke("translate", {
        body: { description },
      });

      if (!response.error) {
        return response.data as Translations;
      }

      const errorMessage = response.error.message || "Translation failed";
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

  return { translateDescription };
};