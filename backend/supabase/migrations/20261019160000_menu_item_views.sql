CREATE TABLE IF NOT EXISTS public.menu_item_views (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_item_views_item_idx ON public.menu_item_views(menu_item_id);
ALTER TABLE public.menu_item_views ENABLE ROW LEVEL SECURITY;
GRANT INSERT (menu_item_id) ON public.menu_item_views TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.menu_item_views_id_seq TO anon, authenticated;
GRANT SELECT ON public.menu_item_views TO authenticated;
CREATE POLICY "Guests can record dish views" ON public.menu_item_views
  FOR INSERT TO anon, authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.menu_items m JOIN public.categories c ON c.id = m.category_id
      WHERE m.id = menu_item_id AND c.is_active = true)
  );
CREATE POLICY "Admins can read dish views" ON public.menu_item_views
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_menu_item_view_counts()
RETURNS TABLE(menu_item_id uuid, view_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT v.menu_item_id, count(*) AS view_count
  FROM public.menu_item_views v
  JOIN public.menu_items m ON m.id = v.menu_item_id
  JOIN public.categories c ON c.id = m.category_id AND c.is_active = true
  GROUP BY v.menu_item_id;
$$;
REVOKE ALL ON FUNCTION public.get_menu_item_view_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_menu_item_view_counts() TO anon, authenticated;
