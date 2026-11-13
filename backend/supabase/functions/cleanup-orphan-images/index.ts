import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "menu-images";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return json({ error: "Admin access required" }, 403);
    }

    // Collect every file name still referenced by a menu item
    const { data: items, error: itemsErr } = await admin
      .from("menu_items")
      .select("image_url, thumbnail_url");
    if (itemsErr) throw itemsErr;

    const used = new Set<string>();
    for (const item of items ?? []) {
      for (const url of [item.image_url, item.thumbnail_url]) {
        if (typeof url === "string" && url) {
          const name = decodeURIComponent(url.split(`/object/public/${BUCKET}/`)[1] ?? "");
          if (name) used.add(name.split("?")[0]);
        }
      }
    }

    // List all objects in the bucket (paged)
    const allFiles: string[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error: listErr } = await admin.storage
        .from(BUCKET)
        .list("", { limit: pageSize, offset });
      if (listErr) throw listErr;
      if (!page?.length) break;
      allFiles.push(...page.map((f) => f.name));
      if (page.length < pageSize) break;
    }

    const orphans = allFiles.filter((name) => !used.has(name) && name !== ".emptyFolderPlaceholder");

    let deleted = 0;
    for (let i = 0; i < orphans.length; i += 100) {
      const chunk = orphans.slice(i, i + 100);
      const { error: delErr } = await admin.storage.from(BUCKET).remove(chunk);
      if (delErr) throw delErr;
      deleted += chunk.length;
    }

    return json({ totalFiles: allFiles.length, used: used.size, deleted });
  } catch (error) {
    console.error("cleanup-orphan-images error:", error);
    return json({ error: error instanceof Error ? error.message : "Cleanup failed" }, 500);
  }
});
