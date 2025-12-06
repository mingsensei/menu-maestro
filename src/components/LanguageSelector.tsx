import { Globe } from "lucide-react";
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
        <Select value={language} onValueChange={(val) => setLanguage(val as Language)}>
            <SelectTrigger className="w-[120px] h-9 gap-2 flex items-center">
                {/* Nếu chưa chọn gì → hiện Globe — nếu đã có language → hiện flag */}
                {flag ? (
                    <span className="text-xl">{flag}</span>
                ) : (
                    <Globe className="w-4 h-4" />
                )}

                <SelectValue />
            </SelectTrigger>

            <SelectContent>
                {(Object.keys(languageLabels) as Language[]).map((lang) => (
                    <SelectItem key={lang} value={lang}>
                        {languageLabels[lang]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};
