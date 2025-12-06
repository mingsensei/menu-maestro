import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    if (!description) {
      throw new Error("Description is required");
    }

    const prompt = `Translate the following food/dish description into these languages. Return ONLY a valid JSON object with no markdown formatting, no code blocks, just the raw JSON.

Description to translate: "${description}"

Return exactly this JSON structure with translations:
{
  "description_ko": "Korean translation here",
  "description_ja": "Japanese translation here",
  "description_cn": "Chinese (Simplified) translation here",
  "description_vi": "Vietnamese translation here",
  "description_ru": "Russian translation here",
  "description_kz": "Kazakh translation here",
  "description_es": "Spanish translation here",
  "description_fr": "French translation here",
  "description_it": "Italian translation here"
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Translation service is temporarily busy. Please try again in a few moments." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error("No translation generated");
    }

    // Parse the JSON response
    const cleanedText = generatedText.replace(/```json\n?|\n?```/g, "").trim();
    const translations = JSON.parse(cleanedText);

    return new Response(JSON.stringify(translations), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Translation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Translation failed";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
