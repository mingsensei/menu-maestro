import { useState } from "react";
import { X, ArrowLeft, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage, Language } from "@/contexts/LanguageContext";
import { MenuItem } from "@/type/type";

interface MenuItemDetailModalProps {
  item: MenuItem | null;
  onClose: () => void;
}

export const MenuItemDetailModal = ({ item, onClose }: MenuItemDetailModalProps) => {
  const { language } = useLanguage();
  const [isZoomed, setIsZoomed] = useState(false);

  if (!item) return null;

  const getDescription = () => {
    const descriptionMap: Record<Language, string | null | undefined> = {
      en: item.description,
      ko: item.description_ko,
      ja: item.description_ja,
      cn: item.description_cn,
      vi: item.description_vi,
      ru: item.description_ru,
      kz: item.description_kz,
      es: item.description_es,
      fr: item.description_fr,
      it: item.description_it,
    };
    return descriptionMap[language] || item.description;
  };

  const handleClose = () => {
    setIsZoomed(false);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in flex flex-col items-center justify-center px-4"
      onClick={handleClose}
    >
      {/* Zoomed Image Overlay */}
      {isZoomed && item.image_url && (
        <div 
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          <img
            src={item.image_url}
            alt={item.name}
            className="max-w-[95vw] max-h-[95vh] object-contain animate-scale-in"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full"
            onClick={() => setIsZoomed(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Modal Card */}
      <div 
        className="w-full max-w-lg bg-card rounded-2xl shadow-2xl animate-slide-up overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-10 bg-background/80 backdrop-blur-sm rounded-full"
          onClick={handleClose}
        >
          <X className="h-5 w-5" />
        </Button>

        {/* Image */}
        <div className="relative bg-muted flex items-center justify-center group">
          {item.image_url ? (
            <>
              <img
                src={item.image_url}
                alt={item.name}
                className="w-full max-h-[60vh] object-contain cursor-zoom-in transition-transform duration-300"
                onClick={() => setIsZoomed(true)}
              />
              {/* Zoom button overlay */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setIsZoomed(true)}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <div className="w-full h-48 flex items-center justify-center bg-gradient-to-br from-muted to-muted/70">
              <span className="text-7xl opacity-30">🍽️</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 pt-4">
          <h2 className="font-sans text-2xl md:text-3xl font-semibold text-foreground mb-4">
            {item.name}
          </h2>
          
          <p className="text-muted-foreground leading-relaxed mb-6">
            {getDescription()}
          </p>
        </div>
      </div>

      {/* Back to Menu Button - Outside the modal card */}
      <Button
        onClick={handleClose}
        className="mt-6 gap-2 rounded-full px-6 shadow-lg animate-fade-in"
        style={{ animationDelay: "0.15s" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Menu
      </Button>
    </div>
  );
};
