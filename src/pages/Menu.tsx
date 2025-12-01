import { useState, useEffect } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MenuItemCard } from "@/components/MenuItemCard";
import { useToast } from "@/hooks/use-toast";

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
}

const Menu = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchMenuItems();
    trackPageView();
  }, []);

  useEffect(() => {
    filterAndSortItems();
  }, [menuItems, searchQuery, selectedCategory, sortBy]);

  const fetchMenuItems = async () => {
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .order("name");

      if (error) throw error;
      setMenuItems(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load menu items",
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

    // Filter by search
    if (searchQuery) {
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter((item) => item.category === selectedCategory);
    }

    // Sort
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

  const categories = [
    { value: "all", label: "All Categories" },
    { value: "appetizer", label: "Appetizers" },
    { value: "main_course", label: "Main Courses" },
    { value: "pasta", label: "Pasta" },
    { value: "pizza", label: "Pizza" },
    { value: "dessert", label: "Desserts" },
    { value: "beverage", label: "Beverages" },
    { value: "wine", label: "Wine" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="relative bg-gradient-to-br from-primary via-primary/90 to-accent text-white py-20 px-4">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE4YzAtMy4zMTQtMi42ODYtNi02LTZzLTYgMi42ODYtNiA2IDIuNjg2IDYgNiA2IDYtMi42ODYgNi02em0wIDI0YzAtMy4zMTQtMi42ODYtNi02LTZzLTYgMi42ODYtNiA2IDIuNjg2IDYgNiA2IDYtMi42ODYgNi02eiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
        <div className="container mx-auto max-w-6xl relative z-10 text-center">
          <h1 className="text-5xl md:text-6xl font-serif font-bold mb-4 animate-fade-in">
            Trattoria Bella
          </h1>
          <p className="text-xl md:text-2xl font-light opacity-90 animate-fade-in" style={{ animationDelay: "0.2s" }}>
            Authentic Italian Cuisine
          </p>
        </div>
      </header>

      {/* Filters Section */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b shadow-sm">
        <div className="container mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Category Filter */}
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                <SelectItem value="price-asc">Price (Low-High)</SelectItem>
                <SelectItem value="price-desc">Price (High-Low)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Menu Grid */}
      <main className="container mx-auto max-w-6xl px-4 py-12">
        {loading ? (
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl text-muted-foreground">No menu items found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item, index) => (
              <MenuItemCard
                key={item.id}
                item={item}
                index={index}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-accent text-accent-foreground py-8 mt-20">
        <div className="container mx-auto max-w-6xl px-4 text-center">
          <p className="font-serif text-lg mb-2">Trattoria Bella</p>
          <p className="text-sm opacity-80">Authentic Italian dining experience</p>
          <div className="mt-4">
            <Button variant="ghost" size="sm" asChild>
              <a href="/auth">Admin Login</a>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Menu;