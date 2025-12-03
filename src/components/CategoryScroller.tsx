import { useRef } from "react";

interface Category {
  id: string;
  name: string;
  display_name: string;
  display_order: number;
  is_active: boolean;
}

interface CategoryScrollerProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export const CategoryScroller = ({ 
  categories, 
  selectedCategory, 
  onSelectCategory 
}: CategoryScrollerProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div 
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 snap-x snap-mandatory"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* All Categories Button */}
      <button
        onClick={() => onSelectCategory("all")}
        className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all snap-start ${
          selectedCategory === "all"
            ? "bg-primary text-primary-foreground shadow-md"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        All
      </button>

      {/* Category Buttons */}
      {categories
        .filter(cat => cat.is_active)
        .sort((a, b) => a.display_order - b.display_order)
        .map((category) => (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.name)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap snap-start ${
              selectedCategory === category.name
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {category.display_name}
          </button>
        ))}
    </div>
  );
};
