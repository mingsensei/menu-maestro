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

const SYSTEM_PROMPT = `You are a professional restaurant menu translator.
Translate the provided English food description into these languages:
- Korean
- Japanese
- Chinese (Simplified)
- Vietnamese
- Russian
- Kazakh
- Spanish
- French
- Italian

Return only a raw JSON object with exactly these keys:
description_ko, description_ja, description_cn, description_vi, description_ru, description_kz, description_es, description_fr, description_it.`;

const buildUserPrompt = (description: string) => `Translate this restaurant menu description:\n\n${description}`;

const sanitizeJsonText = (value: string) => value.replace(/```json\n?|\n?```/g, "").trim();

const validateTranslations = (payload: unknown): TranslationResponse => {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description } = await req.json();

    if (!description || typeof description !== "string" || !description.trim()) {
      return new Response(JSON.stringify({ error: "Description is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(description.trim()) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Lovable AI error:", errorText);

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

    const data = await aiResponse.json();
    const generatedText = data.choices?.[0]?.message?.content;

    if (!generatedText || typeof generatedText !== "string") {
      throw new Error("No translation generated");
    }

    const translations = validateTranslations(JSON.parse(sanitizeJsonText(generatedText)));

    return new Response(JSON.stringify(translations), {
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