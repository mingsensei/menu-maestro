import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Percent, Loader2 } from "lucide-react";
import { MenuItem, Category } from "@/type/type";

interface QuickVATUpdateProps {
  categories: Category[];
}



export const QuickVATUpdate = ({ categories }: QuickVATUpdateProps) => {
  const [open, setOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedVAT, setSelectedVAT] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { toast } = useToast();

  const fetchMenuItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, price, vat, category_id")
        .order("name");

      if (error) throw error;
      setMenuItems(data as MenuItem[] || []);
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

  useEffect(() => {
    if (open) {
      fetchMenuItems();
      setSelectedItems(new Set());
      setSelectedVAT("");
    }
  }, [open]);

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "—";
    const category = categories.find((c) => c.id === categoryId);
    return category?.display_name || "—";
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(menuItems.map((item) => item.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleApplyVAT = async () => {
    setUpdating(true);
    try {
      const vatValue = parseFloat(selectedVAT);
      const itemIds = Array.from(selectedItems);

      const { error } = await supabase
        .from("menu_items")
        .update({ vat: vatValue })
        .in("id", itemIds);

      if (error) throw error;

      toast({
        title: "Success",
        description: `VAT updated to ${selectedVAT}% for ${itemIds.length} item(s)`,
      });

      setShowConfirm(false);
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update VAT",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const isAllSelected = menuItems.length > 0 && selectedItems.size === menuItems.length;
  const isSomeSelected = selectedItems.size > 0 && selectedItems.size < menuItems.length;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Percent className="w-4 h-4 mr-2" />
            Quick VAT Update
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Quick VAT Update</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-4 py-4 border-b">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Set VAT:</span>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={selectedVAT}
                  onChange={(e) => setSelectedVAT(e.target.value)}
                  placeholder="Enter %"
                  className="w-[100px] pr-6"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
            </div>
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={selectedItems.size === 0 || !selectedVAT || isNaN(parseFloat(selectedVAT))}
            >
              Apply VAT
            </Button>
            <span className="text-sm text-muted-foreground ml-auto">
              {selectedItems.size} item(s) selected
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={isAllSelected}
                        // @ts-ignore - indeterminate is valid but not in types
                        indeterminate={isSomeSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Current VAT</TableHead>
                    <TableHead>Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {menuItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={(checked) =>
                            handleSelectItem(item.id, checked as boolean)
                          }
                          aria-label={`Select ${item.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right">
                        €{item.price.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">{item.vat}%</TableCell>
                      <TableCell>{getCategoryName(item.category_id)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm VAT Update</AlertDialogTitle>
            <AlertDialogDescription>
              Apply VAT <strong>{selectedVAT}%</strong> to{" "}
              <strong>{selectedItems.size}</strong> selected item(s)?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApplyVAT} disabled={updating}>
              {updating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                "Apply VAT"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
