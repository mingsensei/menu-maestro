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

export const useTranslation = () => {
  const translateDescription = async (description: string): Promise<Translations> => {
    const response = await supabase.functions.invoke("translate", {
      body: { description },
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data as Translations;
  };

  return { translateDescription };
};
