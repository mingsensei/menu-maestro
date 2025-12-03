import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MenuItemCardProps {
  item: {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    image_url: string | null;
  };
  index: number;
}

export const MenuItemCard = ({ item, index }: MenuItemCardProps) => {
  const categoryColors: Record<string, string> = {
    appetizer: "bg-muted text-muted-foreground",
    main_course: "bg-primary text-primary-foreground",
    pasta: "bg-secondary text-secondary-foreground",
    pizza: "bg-accent text-accent-foreground",
    dessert: "bg-primary/20 text-primary",
    beverage: "bg-muted/50 text-foreground",
    wine: "bg-accent/70 text-accent-foreground",
  };

  const categoryLabels: Record<string, string> = {
    appetizer: "Appetizer",
    main_course: "Main Course",
    pasta: "Pasta",
    pizza: "Pizza",
    dessert: "Dessert",
    beverage: "Beverage",
    wine: "Wine",
  };

  return (
    <Card 
      className="overflow-hidden hover:shadow-elegant transition-all duration-500 hover:-translate-y-2 animate-fade-in group cursor-pointer border border-border/50"
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {/* Image */}
      <div className="relative h-56 bg-muted overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/70">
            <span className="text-5xl opacity-30">🍽️</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        <Badge 
          className={`absolute top-4 right-4 ${categoryColors[item.category] || "bg-muted"} shadow-md`}
        >
          {categoryLabels[item.category] || item.category}
        </Badge>
      </div>

      {/* Content */}
      <CardContent className="p-6">
        <h3 className="font-serif text-xl font-bold mb-2 text-foreground">
          {item.name}
        </h3>
        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2">
          <div>{item.price.toLocaleString('vi-VN')} ₫</div>
        </p>
      </CardContent>
    </Card>
  );
};