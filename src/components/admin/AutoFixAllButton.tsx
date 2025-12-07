import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wand2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import heic2any from "heic2any";

export const AutoFixAllButton = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const { toast } = useToast();
  const { translateDescription } = useTranslation();

  /**
   * NEW VERSION — WORKING 100%
   * Convert image to WEBP (HEIC supported)
   */
  const convertImageToWebp = async (imageUrl: string): Promise<string | null> => {
    try {
      const lower = imageUrl.toLowerCase();
      const ext = lower.split("?")[0]; // FIX: remove query params

      if (ext.endsWith(".webp")) return null;

      // 1. ALWAYS download file from Supabase Storage, not via fetch()
      const filePath = imageUrl.split("/object/public/menu-images/")[1];
      if (!filePath) {
        console.error("❌Invalid storage URL:", imageUrl);
        return null;
      }

      const { data: downloadData, error: downloadErr } = await supabase.storage
          .from("menu-images")
          .download(filePath);

      if (downloadErr || !downloadData) {
        console.error("❌ Storage download failed:", downloadErr);
        return null;
      }

      let blob: Blob = downloadData;
      const isHeic = ext.endsWith(".heic") || ext.endsWith(".heif");

      // 2. Convert HEIC to PNG first
      if (isHeic) {
        try {
          const converted = await heic2any({
            blob,
            toType: "image/png",
            quality: 1,
          });
          blob = converted as Blob;
        } catch (heicErr) {
          console.error("❌ HEIC conversion failed:", heicErr);
          return null;
        }
      }

      // 3. Create <img>
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = "anonymous";

      return new Promise((resolve) => {
        img.onload = async () => {
          let width = img.naturalWidth;
          let height = img.naturalHeight;

          // 4. Resize very large images (iPhone → 4000–8000 px)
          const MAX = 1600;
          if (width > MAX || height > MAX) {
            const scale = MAX / Math.max(width, height);
            width = Math.floor(width * scale);
            height = Math.floor(height * scale);
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);

          ctx.drawImage(img, 0, 0, width, height);

          // 5. Convert to WEBP
          canvas.toBlob(
              async (webpBlob) => {
                if (!webpBlob) {
                  console.error("❌ toBlob returned null");
                  return resolve(null);
                }

                const newName = `${crypto.randomUUID()}.webp`;

                const { error: uploadErr } = await supabase.storage
                    .from("menu-images")
                    .upload(newName, webpBlob, {
                      contentType: "image/webp",
                    });

                if (uploadErr) {
                  console.error("❌ Upload failed:", uploadErr);
                  return resolve(null);
                }

                const { data } = supabase.storage
                    .from("menu-images")
                    .getPublicUrl(newName);

                resolve(data.publicUrl);
              },
              "image/webp",
              0.82
          );
        };

        img.onerror = () => {
          console.error("❌ <img> load failed");
          resolve(null);
        };

        img.src = blobUrl;
      });
    } catch (err) {
      console.error("❌ convertImageToWebp failed:", err);
      return null;
    }
  };

  // =============== AUTO FIX ALL ===============
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const handleAutoFixAll = async () => {
    setLoading(true);
    let fixedCount = 0;
    let errorCount = 0;

    try {
      const { data: items, error } = await supabase.from("menu_items").select("*");
      if (error) throw error;
      if (!items?.length) return;

      setProgress({ current: 0, total: items.length });

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setProgress({ current: i + 1, total: items.length });

        const updates: any = {};
        let needsUpdate = false;

        // TRANSLATION (omitted, unchanged)
        // -----------------------------------------------

        // IMAGE FIX
        if (item.image_url && !item.image_url.toLowerCase().includes(".webp")) {
          const newUrl = await convertImageToWebp(item.image_url);
          if (newUrl) {
            updates.image_url = newUrl;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          const { error: updateErr } = await supabase
              .from("menu_items")
              .update(updates)
              .eq("id", item.id);

          if (updateErr) {
            console.error("Update error:", updateErr);
            errorCount++;
          } else {
            fixedCount++;
          }
        }
      }

      toast({
        title: "Completed",
        description: `${fixedCount} items fixed — ${errorCount} errors.`,
      });

      if (fixedCount > 0) window.location.reload();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
      <Button variant="outline" disabled={loading} onClick={handleAutoFixAll}>
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
