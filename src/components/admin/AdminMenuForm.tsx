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
import heic2any from "heic2any";

interface AdminMenuFormProps {
  editingItem?: MenuItem;
  onClose: () => void;
  categories: Category[];
}

const LANGUAGE_LABELS: Record<string, string> = {
  description_ko: "Korean",
  description_ja: "Japanese",
  description_cn: "Chinese",
  description_vi: "Vietnamese",
  description_ru: "Russian",
  description_kz: "Kazakh",
  description_es: "Spanish",
  description_fr: "French",
  description_it: "Italian",
};

export const AdminMenuForm = ({ editingItem, onClose, categories }: AdminMenuFormProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [vat, setVat] = useState("0");
  const [categoryId, setCategoryId] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [converting, setConverting] = useState(false);
  const { toast } = useToast();
  const { translateDescription } = useTranslation();

  // Translation fields for editing
  const [translations, setTranslations] = useState({
    description_ko: "",
    description_ja: "",
    description_cn: "",
    description_vi: "",
    description_ru: "",
    description_kz: "",
    description_es: "",
    description_fr: "",
    description_it: "",
  });

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setDescription(editingItem.description);
      setPrice(editingItem.price.toString());
      setVat(editingItem.vat?.toString() || "0");
      setCategoryId(editingItem.category_id || "");
      setImagePreview(editingItem.image_url);
      setTranslations({
        description_ko: editingItem.description_ko || "",
        description_ja: editingItem.description_ja || "",
        description_cn: editingItem.description_cn || "",
        description_vi: editingItem.description_vi || "",
        description_ru: editingItem.description_ru || "",
        description_kz: editingItem.description_kz || "",
        description_es: editingItem.description_es || "",
        description_fr: editingItem.description_fr || "",
        description_it: editingItem.description_it || "",
      });
    }
  }, [editingItem]);

  const convertHeicToWebp = async (file: File): Promise<File> => {
    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();
    
    // Check if HEIC/HEIF
    if (fileType === "image/heic" || fileType === "image/heif" || 
        fileName.endsWith(".heic") || fileName.endsWith(".heif")) {
      setConverting(true);
      try {
        const convertedBlob = await heic2any({
          blob: file,
          toType: "image/webp",
          quality: 0.9,
        });
        
        const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
        const newFileName = file.name.replace(/\.(heic|heif)$/i, ".webp");
        return new File([blob], newFileName, { type: "image/webp" });
      } catch (error) {
        console.error("HEIC conversion error:", error);
        toast({
          title: "Conversion Warning",
          description: "Failed to convert HEIC image. Please try a different format.",
          variant: "destructive",
        });
        throw error;
      } finally {
        setConverting(false);
      }
    }
    return file;
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const processedFile = await convertHeicToWebp(file);
        setImageFile(processedFile);
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(processedFile);
      } catch (error) {
        // Error already handled in convertHeicToWebp
      }
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

  const handleTranslationChange = (key: string, value: string) => {
    setTranslations((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const imageUrl = await uploadImage();

      let finalTranslations = { ...translations };

      // For new items or when English description changed, auto-translate
      if (!editingItem || editingItem.description !== description) {
        setTranslating(true);
        try {
          const autoTranslations = await translateDescription(description);
          // For new items, use auto-translations
          // For editing, only update empty fields or if description changed
          if (!editingItem) {
            finalTranslations = autoTranslations;
          } else {
            // Keep manually edited translations, fill in empty ones
            Object.keys(autoTranslations).forEach((key) => {
              if (!translations[key as keyof typeof translations]) {
                finalTranslations[key as keyof typeof finalTranslations] = 
                  autoTranslations[key as keyof typeof autoTranslations] || null;
              }
            });
          }
        } catch (translationError) {
          console.error("Translation error:", translationError);
          toast({
            title: "Translation Warning",
            description: "Auto-translation failed. Item will be saved with current descriptions.",
          });
        }
        setTranslating(false);
      }

      const itemData = {
        name,
        description,
        price: parseFloat(price),
        vat: parseFloat(vat) || 0,
        category_id: categoryId || null,
        image_url: imageUrl,
        description_ko: finalTranslations.description_ko || null,
        description_ja: finalTranslations.description_ja || null,
        description_cn: finalTranslations.description_cn || null,
        description_vi: finalTranslations.description_vi || null,
        description_ru: finalTranslations.description_ru || null,
        description_kz: finalTranslations.description_kz || null,
        description_es: finalTranslations.description_es || null,
        description_fr: finalTranslations.description_fr || null,
        description_it: finalTranslations.description_it || null,
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
              accept="image/*,.heic,.heif"
              onChange={handleImageChange}
              className="hidden"
              id="image-upload"
              disabled={converting}
            />
            <Label htmlFor="image-upload" className="cursor-pointer">
              <div className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 hover:border-primary transition-colors">
                {converting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    <span>{imageFile ? imageFile.name : "Upload Image"}</span>
                  </>
                )}
              </div>
            </Label>
            <p className="text-xs text-muted-foreground text-center">
              Supports HEIC/HEIF (auto-converts to WebP)
            </p>
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

            {/* Description (English) */}
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
              {!editingItem && (
                <p className="text-xs text-muted-foreground">
                  Will be auto-translated to Korean, Japanese, Chinese, Vietnamese, Russian, Kazakh, Spanish, French, and Italian
                </p>
              )}
            </div>

            {/* Translation fields - only show when editing */}
            {editingItem && (
              <div className="space-y-4 border-t pt-4">
                <h4 className="font-medium text-sm text-muted-foreground">Translations (editable)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key}>{label}</Label>
                      <Textarea
                        id={key}
                        value={translations[key as keyof typeof translations]}
                        onChange={(e) => handleTranslationChange(key, e.target.value)}
                        placeholder={`${label} description...`}
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Price and VAT */}
            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-2">
                <Label htmlFor="vat">VAT (%)</Label>
                <Input
                  id="vat"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={vat}
                  onChange={(e) => setVat(e.target.value)}
                  placeholder="10"
                />
              </div>
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
              <Button type="submit" disabled={loading || translating || converting} className="flex-1">
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
