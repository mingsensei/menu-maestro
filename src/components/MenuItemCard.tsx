import { Card, CardContent } from "@/components/ui/card";
import { Image as ImageIcon } from "lucide-react";
import { MenuItem } from "@/type/type";
import { useLanguage, Language } from "@/contexts/LanguageContext";

interface MenuItemCardProps {
  item: MenuItem;
  index: number;
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

export const MenuItemCard = ({ item, index }: MenuItemCardProps) => {
  const { language } = useLanguage();
  
  const descriptionKey = descriptionKeyMap[language];
  const description = (item[descriptionKey] as string) || item.description || "";

  return (
    <Card 
      className="overflow-hidden hover:shadow-elegant transition-all duration-500 hover:-translate-y-2 animate-fade-in group cursor-pointer border border-border/50 z-10"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      {/* Image */}
      <div className="relative h-40 bg-muted overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <ImageIcon className="w-12 h-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      </div>

      {/* Content */}
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-sans font-semibold text-lg text-foreground">{item.name}</h3>
          <div className="text-right ml-2">
            <span className="text-primary font-bold whitespace-nowrap">
              {item.price.toLocaleString('vi-VN')} ₫
            </span>
            {item.vat > 0 && (
              <span className="text-xs text-muted-foreground block">
                (+{item.vat}% VAT)
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {description}
        </p>
      </CardContent>
    </Card>
  );
};
