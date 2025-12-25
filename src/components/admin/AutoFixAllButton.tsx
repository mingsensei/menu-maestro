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
   * Convert image to WEBP (HEIC/HEIF supported with fallback)
   */
  const convertImageToWebp = async (imageUrl: string): Promise<string | null> => {
    try {
      const lower = imageUrl.toLowerCase();
      const urlWithoutParams = lower.split("?")[0];

      if (urlWithoutParams.endsWith(".webp")) return null;

      // 1. Extract file path from Supabase Storage URL
      const filePath = imageUrl.split("/object/public/menu-images/")[1];
      if (!filePath) {
        console.error("❌ Invalid storage URL:", imageUrl);
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
      const isHeic = urlWithoutParams.endsWith(".heic") || urlWithoutParams.endsWith(".heif");
      let heicConversionSuccess = true;

      // 2. Convert HEIC/HEIF to PNG first
      if (isHeic) {
        try {
          console.log("🔄 Converting HEIC/HEIF to PNG...");
          const converted = await heic2any({
            blob,
            toType: "image/png",
            quality: 1,
          });
          // heic2any can return Blob or Blob[]
          blob = Array.isArray(converted) ? converted[0] : converted;
          console.log("✅ HEIC/HEIF converted to PNG successfully");
        } catch (heicErr) {
          console.error("❌ HEIC conversion failed, will try to upload original:", heicErr);
          heicConversionSuccess = false;
        }
      }

      // 3. If HEIC conversion failed, upload original file as-is
      if (isHeic && !heicConversionSuccess) {
        const ext = urlWithoutParams.split(".").pop() || "heic";
        const newName = `${crypto.randomUUID()}.${ext}`;
        
        const { error: uploadErr } = await supabase.storage
          .from("menu-images")
          .upload(newName, downloadData, {
            contentType: downloadData.type || "image/heic",
          });

        if (uploadErr) {
          console.error("❌ Original upload failed:", uploadErr);
          return null;
        }

        const { data } = supabase.storage
          .from("menu-images")
          .getPublicUrl(newName);

        console.log("✅ Uploaded original HEIC file:", data.publicUrl);
        return data.publicUrl;
      }

      // 4. Create <img> element to draw on canvas
      const blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = "anonymous";

      return new Promise((resolve) => {
        img.onload = async () => {
          URL.revokeObjectURL(blobUrl); // Clean up blob URL
          
          let width = img.naturalWidth;
          let height = img.naturalHeight;

          // 5. Resize very large images (iPhone → 4000–8000 px)
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
          if (!ctx) {
            console.error("❌ Could not get canvas context");
            return resolve(null);
          }

          ctx.drawImage(img, 0, 0, width, height);

          // 6. Convert to WEBP
          canvas.toBlob(
            async (webpBlob) => {
              if (!webpBlob) {
                console.error("❌ toBlob returned null, uploading original");
                // Fallback: upload original blob
                const ext = isHeic ? "png" : (urlWithoutParams.split(".").pop() || "jpg");
                const fallbackName = `${crypto.randomUUID()}.${ext}`;
                
                const { error: fallbackErr } = await supabase.storage
                  .from("menu-images")
                  .upload(fallbackName, blob, {
                    contentType: blob.type || `image/${ext}`,
                  });

                if (fallbackErr) {
                  console.error("❌ Fallback upload failed:", fallbackErr);
                  return resolve(null);
                }

                const { data: fallbackData } = supabase.storage
                  .from("menu-images")
                  .getPublicUrl(fallbackName);

                return resolve(fallbackData.publicUrl);
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

              console.log("✅ Converted to WebP:", data.publicUrl);
              resolve(data.publicUrl);
            },
            "image/webp",
            0.82
          );
        };

        img.onerror = (e) => {
          URL.revokeObjectURL(blobUrl);
          console.error("❌ <img> load failed:", e);
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
