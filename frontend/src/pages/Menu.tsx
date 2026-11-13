import {useState, useEffect, useCallback, useRef} from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
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
import { Snowfall } from "@/components/Snowfall";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [selectedCategory, setSelectedCategory] = useState<string>(searchParams.get("category") || "all");
  const [sortBy, setSortBy] = useState<string>("default");
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const requestedItem = searchParams.get("item");
  useEffect(() => {
    if (!requestedItem) return;
    setSearchQuery(searchParams.get("search") || "");
    setSelectedCategory(searchParams.get("category") || "all");
    setCurrentPage(1);
  }, [requestedItem, searchParams]);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Menu | Riverside Terrace Restaurant";
  }, []);
  useEffect(() => {
    if (requestedItem) {
      const item = menuItems.find(item => item.id === requestedItem);
      if (item) setSelectedItem(item);
    }
  }, [requestedItem, menuItems]);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const heroRef = useRef<HTMLDivElement>(null);
  const [heroHeight, setHeroHeight] = useState(0);

  useEffect(() => {
    if (heroRef.current) {
      const updateHeight = () => {
        setHeroHeight(heroRef.current!.offsetHeight);
      };

      updateHeight(); // chạy lần đầu

      // update nếu window resize
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
    trackPageView();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, sortBy]);

  const fetchCategories = async () => {
    try {
      const { data } = await api.categories();
      setCategories(data || []);
    } catch (error) {
      console.error("Failed to load categories:", error);
    }
  };

  const fetchMenuItems = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const { data, count } = await api.menu({ page: currentPage, search: searchQuery, category: selectedCategory, sort: sortBy }, signal);

      setMenuItems(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      if (signal.aborted) return;
      toast({
        title: "Error",
        description: "Failed to load menu",
        variant: "destructive",
      });
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [currentPage, searchQuery, selectedCategory, sortBy, toast]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void fetchMenuItems(controller.signal); }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [fetchMenuItems]);

  const trackPageView = async () => {
    try {
      await api.pageView(window.location.pathname);
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
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

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
    <div className="min-h-screen bg-background relative">
      {/* Full Page Snowfall Effect */}

      
      <Navigation />
      <div
        ref={heroRef}
        className="hero-section relative w-full h-[120px] md:h-[155px] lg:h-[180px] overflow-hidden z-0"
    >
      {/* Hero background */}
      <img
          src="https://res.cloudinary.com/dbp8ozwty/image/upload/v1764899267/z7291253840965_9eefef40c488b1bd2d17bff28170f43f_1_wg9t7t.jpg"
          alt="Restaurant Banner"
          className="w-full h-full object-cover"
      />

      {/* DECOR ITEMS FROM CLOUDINARY */}

      {/* Chuông – góc trên phải */}
  {/*      <img*/}
  {/*          src="https://res.cloudinary.com/dbp8ozwty/image/upload/v1765089200/image-removebg-preview_4_qqfjjh.png"*/}
  {/*          alt="Bell"*/}
  {/*          className="*/}
  {/*  absolute top-0 right-0*/}
  {/*  w-[38px] md:w-[52px] lg:w-[68px]*/}
  {/*  select-none pointer-events-none*/}
  {/*"*/}
  {/*      />*/}

        {/* Mũ Noel – cạnh quả chuông */}
    {/*  <img*/}
    {/*      src="https://res.cloudinary.com/dbp8ozwty/image/upload/v1765088397/pngtree-snowman-winter-christmas-element-seven-png-image_10232808-removebg-preview_1_cfcrjx.png"*/}
    {/*      alt="Snow Man"*/}
    {/*      className="*/}
    {/*    absolute bottom-[-5px] left-12*/}
    {/*  w-[55px] md:w-[70px] lg:w-[85px]*/}
    {/*  select-none pointer-events-none*/}
    {/*"*/}
    {/*  />*/}

      {/* Cây thông – góc dưới trái */}
    {/*  <img*/}
    {/*      src="https://res.cloudinary.com/dbp8ozwty/image/upload/v1765088065/tree_z0eikt.png"*/}
    {/*      alt="Christmas Tree"*/}
    {/*      className="*/}
    {/*  absolute bottom-0 left-2*/}
    {/*  w-[55px] md:w-[70px] lg:w-[85px]*/}
    {/*  select-none pointer-events-none*/}
    {/*"*/}
    {/*  />*/}
    </div>


      {/* Filters Section */}
      <div className="sticky top-16 z-40 bg-background/95 backdrop-blur-md border-b shadow-sm">
        <div className="container mx-auto max-w-6xl px-4 py-4">

          {/* Search + Sort Row */}
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
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="name-asc">A-Z</SelectItem>
                <SelectItem value="name-desc">Z-A</SelectItem>
                <SelectItem value="price-asc">Price ↑</SelectItem>
                <SelectItem value="price-desc">Price ↓</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category Scroller */}
          <div className="w-full">
            <CategoryScroller
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
            />
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
        onClose={() => { setSelectedItem(null); if (requestedItem) { const next = new URLSearchParams(searchParams); next.delete("item"); setSearchParams(next, { replace: true }); } }}
      />

      {/* Footer */}
      <footer className="relative bg-white text-black py-12 mt-12">
        <div className="absolute inset-0 bg-white opacity-50 pointer-events-none"></div>
        <div className="relative z-10 container mx-auto max-w-6xl px-4 text-center">
          <p className="font-sans text-2xl font-semibold mb-3">
            <span className="text-sm opacity-90 mb-4" >Riverside Terrace</span>{" "}
            <span className="text-sm opacity-90 mb-4">Restaurant</span>
          </p>
          <p className="text-sm opacity-90 mb-4">493 Tran Hung Dao Street, An Hai Ward, Da Nang City, Viet Nam</p>
          <div className="h-px w-32 bg-white/30 mx-auto"></div>
          <p className="text-xs mt-4 opacity-75">(+84) 911500440</p>
        </div>
      </footer>
    </div>
  );
};

export default Menu;
