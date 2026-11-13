import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRANSLATION_KEYS = [
  "description_ko",
  "description_ja",
  "description_cn",
  "description_vi",
  "description_ru",
  "description_kz",
  "description_es",
  "description_fr",
  "description_it",
] as const;

type TranslationKey = (typeof TRANSLATION_KEYS)[number];
type TranslationResponse = Record<TranslationKey, string>;

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 1500;
const MODEL = "google/gemini-2.5-flash-lite";

const SYSTEM_PROMPT = `You are a professional restaurant menu translator.
Translate English food descriptions into these languages:
- Korean
- Japanese
- Chinese (Simplified)
- Vietnamese
- Russian
- Kazakh
- Spanish
- French
- Italian

Return only raw JSON with the exact requested structure and no markdown.`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeJsonText = (value: string) => value.replace(/```json\n?|\n?```/g, "").trim();

const validateSingleTranslation = (payload: unknown): TranslationResponse => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid translation payload returned by AI");
  }

  const result = {} as TranslationResponse;
  for (const key of TRANSLATION_KEYS) {
    const rawValue = (payload as Record<string, unknown>)[key];
    result[key] = typeof rawValue === "string" ? rawValue.trim() : "";
  }

  return result;
};

const validateBatchTranslations = (payload: unknown): { items: TranslationResponse[] } => {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { items?: unknown[] }).items)) {
    throw new Error("Invalid batch translation payload returned by AI");
  }

  return {
    items: (payload as { items: unknown[] }).items.map(validateSingleTranslation),
  };
};

const createSinglePrompt = (description: string) => `Translate this restaurant menu description:\n\n${description}\n\nReturn this exact JSON shape:\n{
  "description_ko": "",
  "description_ja": "",
  "description_cn": "",
  "description_vi": "",
  "description_ru": "",
  "description_kz": "",
  "description_es": "",
  "description_fr": "",
  "description_it": ""
}`;

const createBatchPrompt = (descriptions: string[]) => {
  const numbered = descriptions.map((description, index) => `${index + 1}. ${description}`).join("\n");

  return `Translate these restaurant menu descriptions in order:\n\n${numbered}\n\nReturn this exact JSON shape:\n{
  "items": [
    {
      "description_ko": "",
      "description_ja": "",
      "description_cn": "",
      "description_vi": "",
      "description_ru": "",
      "description_kz": "",
      "description_es": "",
      "description_fr": "",
      "description_it": ""
    }
  ]
}\n\nThe items array must have exactly ${descriptions.length} entries in the same order as the input.`;
};

const callLovableAI = async (prompt: string) => {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  let delayMs = INITIAL_DELAY_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (aiResponse.ok) {
      const data = await aiResponse.json();
      const generatedText = data.choices?.[0]?.message?.content;

      if (!generatedText || typeof generatedText !== "string") {
        throw new Error("No translation generated");
      }

      return JSON.parse(sanitizeJsonText(generatedText));
    }

    const errorText = await aiResponse.text();
    console.error("Lovable AI error:", errorText);

    const isRetryable = aiResponse.status === 429 || aiResponse.status >= 500;
    if (isRetryable && attempt < MAX_RETRIES) {
      await wait(delayMs);
      delayMs *= 2;
      continue;
    }

    if (aiResponse.status === 429) {
      return new Response(
        JSON.stringify({ error: "Translation service is busy right now. Please try again in 1–2 minutes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (aiResponse.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI usage limit reached. Please add credits to continue translations." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Lovable AI error: ${aiResponse.status}`);
  }

  return new Response(
    JSON.stringify({ error: "Translation service is busy right now. Please try again in 1–2 minutes." }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description, descriptions } = await req.json();

    if (Array.isArray(descriptions)) {
      const normalizedDescriptions = descriptions
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);

      if (normalizedDescriptions.length === 0) {
        return new Response(JSON.stringify({ error: "At least one description is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiResult = await callLovableAI(createBatchPrompt(normalizedDescriptions));
      if (aiResult instanceof Response) return aiResult;

      return new Response(JSON.stringify(validateBatchTranslations(aiResult)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!description || typeof description !== "string" || !description.trim()) {
      return new Response(JSON.stringify({ error: "Description is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await callLovableAI(createSinglePrompt(description.trim()));
    if (aiResult instanceof Response) return aiResult;

    return new Response(JSON.stringify(validateSingleTranslation(aiResult)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Translation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Translation failed";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});