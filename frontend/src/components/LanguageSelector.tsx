import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage, Language } from "@/contexts/LanguageContext";

const languageFlags: Record<Language, string> = {
  en: "🇬🇧",
  ko: "🇰🇷",
  ja: "🇯🇵",
  cn: "🇨🇳",
  vi: "🇻🇳",
  ru: "🇷🇺",
  kz: "🇰🇿",
  es: "🇪🇸",
  fr: "🇫🇷",
  it: "🇮🇹",
};

export const LanguageSelector = () => {
  const { language, setLanguage, languageLabels } = useLanguage();

  const flag = languageFlags[language];

  return (
    <Select
      value={language}
      onValueChange={(val) => setLanguage(val as Language)}
    >
      <SelectTrigger
        className="w-[72px] h-9 gap-2 flex items-center"
        aria-label={languageLabels[language]}
      >
        <span className="text-xl" aria-hidden="true">
          {flag}
        </span>
        <span className="sr-only">
          <SelectValue />
        </span>
      </SelectTrigger>

      <SelectContent>
        {(Object.keys(languageLabels) as Language[]).map((lang) => (
          <SelectItem key={lang} value={lang}>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true">{languageFlags[lang]}</span>
              <span>{languageLabels[lang]}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
