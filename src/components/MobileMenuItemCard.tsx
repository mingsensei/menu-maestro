import { Card, CardContent } from "@/components/ui/card";
import { Image as ImageIcon } from "lucide-react";
import { MenuItem } from "@/type/type";
import { useLanguage, Language } from "@/contexts/LanguageContext";

interface MobileMenuItemCardProps {
  item: MenuItem;
  onClick: () => void;
}

const descriptionKeyMap: Record<Language, keyof MenuItem> = {
  en: "description",
  ko: "description_ko",
  ja: "description_ja",
  cn: "description_cn",
  vi: "description_vi",
  ru: "description_ru",
  kz: "description_kz",
  es: "description_es",
  fr: "description_fr",
  it: "description_it",
};

export const MobileMenuItemCard = ({ item, onClick }: MobileMenuItemCardProps) => {
  const { language } = useLanguage();
  
  const descriptionKey = descriptionKeyMap[language];
  const description = (item[descriptionKey] as string) || item.description || "";

  return (
    <Card
      className="overflow-hidden cursor-pointer active:scale-95 transition-transform duration-200 border border-border/50 "
      onClick={onClick}
    >
      <div className="relative aspect-square bg-muted">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <h3 className="font-sans font-semibold text-sm text-foreground truncate">{item.name}</h3>
        <span className="text-primary font-bold text-sm">
          {item.price.toLocaleString('vi-VN')} ₫
        </span>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
          {description}
        </p>
      </CardContent>
    </Card>
  );
};
