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
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in flex flex-col items-center justify-start pt-16 md:pt-20 pb-8 px-4"
      onClick={onClose}
    >
      {/* Modal Card */}
      <div 
        className="w-full max-w-lg bg-card rounded-2xl shadow-2xl animate-slide-up overflow-hidden"
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
        <div className="p-6">
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-4">
            {item.name}
          </h2>
          
          <p className="text-muted-foreground leading-relaxed">
            {item.description}
          </p>
        </div>
      </div>

      {/* Back to Menu Button - Separate from modal */}
      <Button
        onClick={onClose}
        className="mt-6 gap-2 rounded-full px-6 shadow-lg animate-fade-in"
        style={{ animationDelay: "0.15s" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Menu
      </Button>
    </div>
  );
};
