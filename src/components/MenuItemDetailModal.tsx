import { X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
}

interface MenuItemDetailModalProps {
  item: MenuItem | null;
  onClose: () => void;
}

export const MenuItemDetailModal = ({ item, onClose }: MenuItemDetailModalProps) => {
  if (!item) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in flex items-start justify-center pt-20 md:pt-24"
      onClick={onClose}
    >
      <div 
        className="relative w-[calc(100%-2rem)] max-w-lg bg-card rounded-2xl shadow-2xl animate-slide-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-10 bg-background/80 backdrop-blur-sm rounded-full"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>

        {/* Image */}
        <div className="relative h-48 md:h-56 bg-muted">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/70">
              <span className="text-7xl opacity-30">🍽️</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
        </div>

        {/* Content */}
        <div className="p-6 pb-10">
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-4">
            {item.name}
          </h2>
          
          <p className="text-muted-foreground leading-relaxed">
            {item.description}
          </p>
        </div>

        {/* Back to Menu Button - Outside bottom center */}
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2">
          <Button
            onClick={onClose}
            className="gap-2 rounded-full px-6 shadow-lg"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Menu
          </Button>
        </div>
      </div>
    </div>
  );
};
