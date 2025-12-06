import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X } from "lucide-react";
import { Category, MenuItem } from "@/type/type";
import { useTranslation } from "@/hooks/useTranslation";

interface AdminMenuFormProps {
  editingItem?: MenuItem;
  onClose: () => void;
  categories: Category[];
}

export const AdminMenuForm = ({ editingItem, onClose, categories }: AdminMenuFormProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const { toast } = useToast();
  const { translateDescription } = useTranslation();

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setDescription(editingItem.description);
      setPrice(editingItem.price.toString());
      setCategoryId(editingItem.category_id || "");
      setImagePreview(editingItem.image_url);
    }
  }, [editingItem]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return editingItem?.image_url || null;

    try {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("menu-images")
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("menu-images")
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error("Image upload error:", error);
      toast({
        title: "Warning",
        description: "Image upload failed, but item will be saved without image",
        variant: "destructive",
      });
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const imageUrl = await uploadImage();

      // Translate description for new items or when description changed
      let translations = {
        description_ko: editingItem?.description_ko || null,
        description_ja: editingItem?.description_ja || null,
        description_cn: editingItem?.description_cn || null,
        description_vi: editingItem?.description_vi || null,
        description_ru: editingItem?.description_ru || null,
        description_kz: editingItem?.description_kz || null,
        description_es: editingItem?.description_es || null,
        description_fr: editingItem?.description_fr || null,
        description_it: editingItem?.description_it || null,
      };

      // Only translate if it's a new item or description changed
      if (!editingItem || editingItem.description !== description) {
        setTranslating(true);
        try {
          translations = await translateDescription(description);
        } catch (translationError) {
          console.error("Translation error:", translationError);
          toast({
            title: "Translation Warning",
            description: "Auto-translation failed. Item will be saved with English description only.",
          });
        }
        setTranslating(false);
      }

      const itemData = {
        name,
        description,
        price: parseFloat(price),
        category_id: categoryId || null,
        image_url: imageUrl,
        ...translations,
      };

      if (editingItem) {
        const { error } = await supabase
          .from("menu_items")
          .update(itemData)
          .eq("id", editingItem.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Menu item updated successfully",
        });
      } else {
        const { error } = await supabase
          .from("menu_items")
          .insert([itemData]);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Menu item created successfully",
        });
      }

      onClose();
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save menu item",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setTranslating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-sans">
            {editingItem ? "Edit Menu Item" : "Add New Menu Item"}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-6">
          {/* Left: Image */}
          <div className="md:w-1/3 flex flex-col gap-4">
            {imagePreview && (
              <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-muted">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <Input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
              id="image-upload"
            />
            <Label htmlFor="image-upload" className="cursor-pointer">
              <div className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 hover:border-primary transition-colors">
                <Upload className="w-5 h-5" />
                <span>{imageFile ? imageFile.name : "Upload Image"}</span>
              </div>
            </Label>
          </div>

          {/* Right: Fields */}
          <div className="md:w-2/3 flex flex-col gap-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Margherita Pizza"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (English) *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Fresh mozzarella, tomato sauce, and basil"
                rows={3}
                required
              />
              <p className="text-xs text-muted-foreground">
                Will be auto-translated to Korean, Japanese, Chinese, Vietnamese, Russian, Kazakh, Spanish, French, and Italian
              </p>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="price">Price (VND) *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="120000"
                required
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={categoryId} onValueChange={setCategoryId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={loading || translating} className="flex-1">
                {loading || translating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {translating ? "Translating..." : "Saving..."}
                  </>
                ) : (
                  <>{editingItem ? "Update Item" : "Create Item"}</>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
