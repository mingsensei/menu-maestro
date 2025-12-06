import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wand2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export const AutoFixAllButton = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const { toast } = useToast();
  const { translateDescription } = useTranslation();

  const convertImageToPng = async (imageUrl: string): Promise<string | null> => {
    try {
      // Check if already PNG
      if (imageUrl.toLowerCase().endsWith('.png')) {
        return null; // No conversion needed
      }

      // Fetch the image
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      // Create canvas and convert to PNG
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      return new Promise((resolve) => {
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          
          ctx.drawImage(img, 0, 0);
          
          canvas.toBlob(async (pngBlob) => {
            if (!pngBlob) {
              resolve(null);
              return;
            }

            // Upload to Supabase
            const fileName = `${Date.now()}_converted.png`;
            const { error: uploadError } = await supabase.storage
              .from("menu-images")
              .upload(fileName, pngBlob, {
                contentType: 'image/png'
              });

            if (uploadError) {
              console.error("PNG upload error:", uploadError);
              resolve(null);
              return;
            }

            const { data } = supabase.storage
              .from("menu-images")
              .getPublicUrl(fileName);

            resolve(data.publicUrl);
          }, 'image/png');
        };
        
        img.onerror = () => resolve(null);
        img.src = imageUrl;
      });
    } catch (error) {
      console.error("Image conversion error:", error);
      return null;
    }
  };

  const handleAutoFixAll = async () => {
    setLoading(true);
    let fixedCount = 0;
    let errorCount = 0;

    try {
      // Fetch all menu items
      const { data: items, error } = await supabase
        .from("menu_items")
        .select("*");

      if (error) throw error;

      if (!items || items.length === 0) {
        toast({
          title: "No items found",
          description: "There are no menu items to fix.",
        });
        setLoading(false);
        return;
      }

      setProgress({ current: 0, total: items.length });

      // Process items in batches
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setProgress({ current: i + 1, total: items.length });

        const updates: Record<string, any> = {};
        let needsUpdate = false;

        // Check for missing translations (es, fr, it)
        const missingTranslations = [];
        if (!item.description_es) missingTranslations.push('es');
        if (!item.description_fr) missingTranslations.push('fr');
        if (!item.description_it) missingTranslations.push('it');

        if (missingTranslations.length > 0 && item.description) {
          try {
            const translations = await translateDescription(item.description);
            
            if (!item.description_es && translations.description_es) {
              updates.description_es = translations.description_es;
              needsUpdate = true;
            }
            if (!item.description_fr && translations.description_fr) {
              updates.description_fr = translations.description_fr;
              needsUpdate = true;
            }
            if (!item.description_it && translations.description_it) {
              updates.description_it = translations.description_it;
              needsUpdate = true;
            }
            // Also fill in any other missing translations
            if (!item.description_ko && translations.description_ko) {
              updates.description_ko = translations.description_ko;
              needsUpdate = true;
            }
            if (!item.description_ja && translations.description_ja) {
              updates.description_ja = translations.description_ja;
              needsUpdate = true;
            }
            if (!item.description_cn && translations.description_cn) {
              updates.description_cn = translations.description_cn;
              needsUpdate = true;
            }
            if (!item.description_vi && translations.description_vi) {
              updates.description_vi = translations.description_vi;
              needsUpdate = true;
            }
            if (!item.description_ru && translations.description_ru) {
              updates.description_ru = translations.description_ru;
              needsUpdate = true;
            }
            if (!item.description_kz && translations.description_kz) {
              updates.description_kz = translations.description_kz;
              needsUpdate = true;
            }
          } catch (translationError) {
            console.error(`Translation error for item ${item.id}:`, translationError);
            errorCount++;
          }
        }

        // Check if image needs PNG conversion
        if (item.image_url && !item.image_url.toLowerCase().endsWith('.png')) {
          try {
            const pngUrl = await convertImageToPng(item.image_url);
            if (pngUrl) {
              updates.image_url = pngUrl;
              needsUpdate = true;
            }
          } catch (imgError) {
            console.error(`Image conversion error for item ${item.id}:`, imgError);
            errorCount++;
          }
        }

        // Update item if changes were made
        if (needsUpdate) {
          const { error: updateError } = await supabase
            .from("menu_items")
            .update(updates)
            .eq("id", item.id);

          if (updateError) {
            console.error(`Update error for item ${item.id}:`, updateError);
            errorCount++;
          } else {
            fixedCount++;
          }
        }
      }

      toast({
        title: "Auto Fix Complete",
        description: `Fixed ${fixedCount} items. ${errorCount > 0 ? `${errorCount} errors occurred.` : ''}`,
      });

      // Reload the page to show updated data
      if (fixedCount > 0) {
        window.location.reload();
      }
    } catch (error: any) {
      console.error("Auto fix error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to auto fix items",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleAutoFixAll}
      disabled={loading}
      className="gap-2"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Fixing... {progress.current}/{progress.total}
        </>
      ) : (
        <>
          <Wand2 className="h-4 w-4" />
          Auto Fix All
        </>
      )}
    </Button>
  );
};
