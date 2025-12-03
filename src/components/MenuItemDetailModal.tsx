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
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="fixed inset-x-4 bottom-0 top-auto md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:w-full bg-card rounded-t-3xl md:rounded-2xl shadow-2xl animate-slide-up overflow-hidden max-h-[85vh]"
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
        <div className="relative h-56 md:h-64 bg-muted">
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
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-14rem)]">
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-3">
            {item.name}
          </h2>
          
          <p className="text-muted-foreground leading-relaxed mb-6">
            {item.description}
          </p>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <span className="text-3xl font-serif font-bold text-primary">
              €{item.price.toFixed(2)}
            </span>
            
            <Button
              variant="outline"
              onClick={onClose}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Menu
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
