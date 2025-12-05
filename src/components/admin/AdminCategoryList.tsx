import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Edit, Trash2, Plus, X, GripVertical } from "lucide-react";
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

interface Category {
  id: string;
  name: string;
  display_name: string;
  display_order: number;
  is_active: boolean;
}

export const AdminCategoryList = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    display_name: "",
    display_order: 0,
    is_active: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("display_order");

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load categories",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingCategory) {
        const { error } = await supabase
          .from("categories")
          .update({
            name: formData.name.toLowerCase().replace(/\s+/g, '_'),
            display_name: formData.display_name,
            display_order: formData.display_order,
            is_active: formData.is_active,
          })
          .eq("id", editingCategory.id);

        if (error) throw error;
        toast({ title: "Success", description: "Category updated successfully" });
      } else {
        const { error } = await supabase
          .from("categories")
          .insert({
            name: formData.name.toLowerCase().replace(/\s+/g, '_'),
            display_name: formData.display_name,
            display_order: formData.display_order,
            is_active: formData.is_active,
          });

        if (error) throw error;
        toast({ title: "Success", description: "Category created successfully" });
      }

      resetForm();
      fetchCategories();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save category",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      display_name: category.display_name,
      display_order: category.display_order,
      is_active: category.is_active,
    });
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;
      toast({ title: "Success", description: "Category deleted successfully" });
      fetchCategories();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete category",
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };

  const toggleActive = async (category: Category) => {
    try {
      const { error } = await supabase
        .from("categories")
        .update({ is_active: !category.is_active })
        .eq("id", category.id);

      if (error) throw error;
      fetchCategories();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update category",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingCategory(null);
    setFormData({ name: "", display_name: "", display_order: 0, is_active: true });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-sans font-semibold">Categories</h2>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>
          )}
        </div>

        {showForm && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingCategory ? "Edit Category" : "Add Category"}</CardTitle>
              <Button variant="ghost" size="icon" onClick={resetForm}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="display_name">Display Name</Label>
                    <Input
                      id="display_name"
                      value={formData.display_name}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value, name: e.target.value })}
                      placeholder="e.g., Main Course"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="display_order">Display Order</Label>
                    <Input
                      id="display_order"
                      type="number"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
                <div className="flex gap-2">
                  <Button type="submit">{editingCategory ? "Update" : "Create"}</Button>
                  <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {categories.map((category) => (
            <Card key={category.id} className={!category.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <GripVertical className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{category.display_name}</p>
                    <p className="text-sm text-muted-foreground">Order: {category.display_order}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={category.is_active}
                    onCheckedChange={() => toggleActive(category)}
                  />
                  <Button variant="outline" size="icon" onClick={() => handleEdit(category)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => setDeleteId(category.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this category.
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
