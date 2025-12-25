import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Edit, Trash2, Image as ImageIcon, Search, ChevronLeft, ChevronRight } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MenuItem, Category } from "@/type/type";

interface AdminMenuListProps {
  onEdit: (item: MenuItem) => void;
  categories: Category[];
}

const ITEMS_PER_PAGE = 20;

export const AdminMenuList = ({ onEdit, categories }: AdminMenuListProps) => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    fetchMenuItems();
  }, [currentPage, searchQuery, selectedCategory]);

  const fetchMenuItems = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("menu_items")
        .select("*", { count: "exact" });

      // Filter by category
      if (selectedCategory && selectedCategory !== "all") {
        query = query.eq("category_id", selectedCategory);
      }

      // Filter by search query
      if (searchQuery.trim()) {
        query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }

      // Get total count first
      const { count } = await query;
      setTotalCount(count || 0);

      // Then fetch paginated data
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let dataQuery = supabase
        .from("menu_items")
        .select("*")
        .order("name")
        .range(from, to);

      if (selectedCategory && selectedCategory !== "all") {
        dataQuery = dataQuery.eq("category_id", selectedCategory);
      }

      if (searchQuery.trim()) {
        dataQuery = dataQuery.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }

      const { data, error } = await dataQuery;

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

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Menu item deleted successfully",
      });

      fetchMenuItems();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete menu item",
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "Uncategorized";
    const category = categories.find((c) => c.id === categoryId);
    return category?.display_name || "Unknown";
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {menuItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {totalCount === 0
                ? "No menu items yet. Add your first item!"
                : "No items match your search criteria."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {menuItems.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <div className="relative h-40 bg-muted">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                      <ImageIcon className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-sans font-semibold text-lg">{item.name}</h3>
                    <div className="text-right">
                      <span className="text-primary font-bold">{item.price.toLocaleString('vi-VN')} ₫</span>
                      {item.vat > 0 && (
                        <span className="text-xs text-muted-foreground block">(+{item.vat}% VAT)</span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                    {item.description}
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    {getCategoryName(item.category_id)}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(item)}
                      className="flex-1"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteId(item.id)}
                      className="flex-1"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-4">
                Page {currentPage} of {totalPages} ({totalCount} items)
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this menu item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
