import { useState, useEffect, useCallback } from "react";
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
import { MenuItemDetailModal } from "@/components/MenuItemDetailModal";
import { Navigation } from "@/components/Navigation";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Category, MenuItem } from "@/type/type";

const ITEMS_PER_PAGE = 20;

const Menu = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  useEffect(() => {
    fetchCategories();
    trackPageView();
  }, []);

  useEffect(() => {
    fetchMenuItems();
  }, [currentPage, searchQuery, selectedCategory, sortBy]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, sortBy]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error("Failed to load categories:", error);
    }
  };

  const fetchMenuItems = useCallback(async () => {
    setLoading(true);
    try {
      // Build the query
      let query = supabase.from("menu_items").select("*", { count: "exact" });

      // Apply search filter
      if (searchQuery.trim()) {
        query = query.or(
          `name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
        );
      }

      // Apply category filter
      if (selectedCategory !== "all") {
        query = query.eq("category_id", selectedCategory);
      }

      // Apply sorting
      const [sortField, sortDirection] = sortBy.split("-");
      query = query.order(sortField, { ascending: sortDirection === "asc" });

      // Apply pagination
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      setMenuItems(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load menu",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, selectedCategory, sortBy, toast]);

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

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const renderPaginationItems = () => {
    const items = [];
    const maxVisiblePages = isMobile ? 3 : 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            onClick={() => handlePageChange(i)}
            isActive={currentPage === i}
            className="cursor-pointer"
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Filters Section */}
      <div className="sticky top-16 z-40 bg-background/95 backdrop-blur-md border-b shadow-sm">
        <div className="container mx-auto max-w-6xl px-4 py-4">
          {/* Search, Category Filter, and Sort Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-border focus:ring-2 focus:ring-primary/20 transition-all h-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-[180px] border-border h-10">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-[130px] border-border h-10">
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
        </div>
      </div>

      {/* Menu Grid */}
      <main className="container mx-auto max-w-6xl px-4 py-6 md:py-12">
        {loading ? (
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : menuItems.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl text-muted-foreground">No menu items found</p>
          </div>
        ) : (
          <>
            {isMobile ? (
              <div className="grid grid-cols-2 gap-4">
                {menuItems.map((item) => (
                  <MobileMenuItemCard
                    key={item.id}
                    item={item}
                    onClick={() => setSelectedItem(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {menuItems.map((item, index) => (
                  <div key={item.id} onClick={() => setSelectedItem(item)}>
                    <MenuItemCard item={item} index={index} />
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => handlePageChange(currentPage - 1)}
                        className={`cursor-pointer ${
                          currentPage === 1
                            ? "pointer-events-none opacity-50"
                            : ""
                        }`}
                      />
                    </PaginationItem>
                    {renderPaginationItems()}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => handlePageChange(currentPage + 1)}
                        className={`cursor-pointer ${
                          currentPage === totalPages
                            ? "pointer-events-none opacity-50"
                            : ""
                        }`}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}

            {/* Results info */}
            <p className="text-center text-sm text-muted-foreground mt-4">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{" "}
              {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} items
            </p>
          </>
        )}
      </main>

      {/* Item Detail Modal */}
      <MenuItemDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* Footer */}
      <footer className="relative bg-white text-black py-12 mt-12">
        <div className="absolute inset-0 bg-white opacity-50 pointer-events-none"></div>
        <div className="relative z-10 container mx-auto max-w-6xl px-4 text-center">
          <p className="font-sans text-2xl font-semibold mb-3">
            <span className="text-green-700">Riverside Terrace</span>{" "}
            <span className="text-red-700">Restaurant</span>
          </p>
          <p className="text-sm opacity-90 mb-4">Where great food meets great views</p>
          <div className="h-px w-32 bg-white/30 mx-auto"></div>
          <p className="text-xs mt-4 opacity-75">© 2025 All rights reserved</p>
        </div>
      </footer>
    </div>
  );
};

export default Menu;
