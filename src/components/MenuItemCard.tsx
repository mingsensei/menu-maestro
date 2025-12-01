import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
      className="overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      {/* Image */}
      <div className="relative h-48 bg-muted overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <span className="text-4xl opacity-20">🍽️</span>
          </div>
        )}
        <Badge 
          className={`absolute top-3 right-3 ${categoryColors[item.category] || "bg-muted"}`}
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
          {item.description}
        </p>
      </CardContent>

      {/* Footer */}
      <CardFooter className="px-6 pb-6 pt-0">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-serif font-bold text-primary">
            €{item.price.toFixed(2)}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
};