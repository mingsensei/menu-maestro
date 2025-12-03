interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
}

interface MobileMenuItemCardProps {
  item: MenuItem;
  onClick: () => void;
}

export const MobileMenuItemCard = ({ item, onClick }: MobileMenuItemCardProps) => {
  return (
    <div 
      className="flex flex-col cursor-pointer group"
      onClick={onClick}
    >
      {/* Image */}
      <div className="relative aspect-square rounded-xl overflow-hidden bg-muted shadow-card">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/70">
            <span className="text-4xl opacity-30">🍽️</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-active:opacity-100 transition-opacity"></div>
      </div>

      {/* Name */}
      <h3 className="font-serif text-sm font-semibold text-foreground mt-2 line-clamp-2 text-center px-1">
        {item.name}
      </h3>
      
      {/* Price */}
      <p className="text-primary font-bold text-sm text-center mt-1">
        €{item.price.toFixed(2)}
      </p>
    </div>
  );
};
