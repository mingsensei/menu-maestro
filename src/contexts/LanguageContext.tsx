import { createContext, useContext, useState, ReactNode } from "react";

export type Language = "en" | "ko" | "ja" | "cn" | "vi" | "ru" | "kz" | "es" | "fr" | "it";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  languageLabels: Record<Language, string>;
}

const languageLabels: Record<Language, string> = {
  en: "English",
  ko: "한국어",
  ja: "日本語",
  cn: "中文",
  vi: "Tiếng Việt",
  ru: "Русский",
  kz: "Қазақша",
  es: "Español",
  fr: "Français",
  it: "Italiano",
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>("en");

  return (
    <LanguageContext.Provider value={{ language, setLanguage, languageLabels }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
