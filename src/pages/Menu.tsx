import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MenuItemCard } from "@/components/MenuItemCard";
import { MobileMenuItemCard } from "@/components/MobileMenuItemCard";
import { CategoryScroller } from "@/components/CategoryScroller";
import { MenuItemDetailModal } from "@/components/MenuItemDetailModal";
import { Navigation } from "@/components/Navigation";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
}

interface Category {
  id: string;
  name: string;
  display_name: string;
  display_order: number;
  is_active: boolean;
}

const Menu = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchData();
    trackPageView();
  }, []);

  useEffect(() => {
    filterAndSortItems();
  }, [menuItems, searchQuery, selectedCategory, sortBy]);

  const fetchData = async () => {
    try {
      const [menuResult, categoryResult] = await Promise.all([
        supabase.from("menu_items").select("*").order("name"),
        supabase.from("categories").select("*").eq("is_active", true).order("display_order"),
      ]);

      if (menuResult.error) throw menuResult.error;
      if (categoryResult.error) throw categoryResult.error;

      setMenuItems(menuResult.data || []);
      setCategories(categoryResult.data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load menu",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const trackPageView = async () => {
    try {
      await supabase.from("page_views").insert({
        page_path: window.location.pathname,
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      console.error("Failed to track page view:", error);
    }
  };

  const filterAndSortItems = () => {
    let filtered = [...menuItems];

    if (searchQuery) {
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter((item) => item.category === selectedCategory);
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        default:
          return 0;
      }
    });

    setFilteredItems(filtered);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <header className="relative bg-gradient-to-br from-primary via-primary/90 to-secondary text-white py-16 md:py-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE4YzAtMy4zMTQtMi42ODYtNi02LTZzLTYgMi42ODYtNiA2IDIuNjg2IDYgNiA2IDYtMi42ODYgNi02em0wIDI0YzAtMy4zMTQtMi42ODYtNi02LTZzLTYgMi42ODYtNiA2IDIuNjg2IDYgNiA2IDYtMi42ODYgNi02eiIvPjwvZz48L2c+PC9zdmc+')] opacity-20"></div>
        <div className="container mx-auto max-w-6xl relative z-10 text-center">
          <h1 className="text-4xl md:text-7xl font-serif font-bold mb-2 md:mb-4 animate-fade-in">
            Riverside Terrace
          </h1>
          <p className="text-lg md:text-2xl font-light opacity-95 animate-fade-in" style={{ animationDelay: "0.2s" }}>
            Fresh flavors, beautiful views
          </p>
          <div className="mt-4 md:mt-6 h-1 w-24 bg-white/40 mx-auto rounded animate-scale-in" style={{ animationDelay: "0.4s" }}></div>
        </div>
      </header>

      {/* Filters Section */}
      <div className="sticky top-16 z-40 bg-background/95 backdrop-blur-md border-b shadow-sm">
        <div className="container mx-auto max-w-6xl px-4 py-4">
          {/* Search and Sort Row */}
          <div className="flex gap-3 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-border focus:ring-2 focus:ring-primary/20 transition-all h-10"
              />
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[130px] border-border h-10">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">A-Z</SelectItem>
                <SelectItem value="name-desc">Z-A</SelectItem>
                <SelectItem value="price-asc">Price ↑</SelectItem>
                <SelectItem value="price-desc">Price ↓</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category Scroller */}
          <CategoryScroller
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />
        </div>
      </div>

      {/* Menu Grid */}
      <main className="container mx-auto max-w-6xl px-4 py-6 md:py-12">
        {loading ? (
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl text-muted-foreground">No menu items found</p>
          </div>
        ) : isMobile ? (
          /* Mobile: 2 columns grid */
          <div className="grid grid-cols-2 gap-4">
            {filteredItems.map((item) => (
              <MobileMenuItemCard
                key={item.id}
                item={item}
                onClick={() => setSelectedItem(item)}
              />
            ))}
          </div>
        ) : (
          /* Desktop: 3 columns grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredItems.map((item, index) => (
              <div key={item.id} onClick={() => setSelectedItem(item)}>
                <MenuItemCard item={item} index={index} />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Item Detail Modal */}
      <MenuItemDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* Footer */}
      <footer className="bg-secondary text-secondary-foreground py-12 mt-12">
        <div className="container mx-auto max-w-6xl px-4 text-center">
          <p className="font-serif text-2xl mb-3">Riverside Terrace</p>
          <p className="text-sm opacity-90 mb-4">Where great food meets great views</p>
          <div className="h-px w-32 bg-white/20 mx-auto"></div>
          <p className="text-xs mt-4 opacity-75">© 2024 All rights reserved</p>
        </div>
      </footer>
    </div>
  );
};

export default Menu;
