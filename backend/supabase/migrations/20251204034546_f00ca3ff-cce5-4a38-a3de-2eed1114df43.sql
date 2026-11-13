-- Add category_id column with foreign key to categories table
ALTER TABLE public.menu_items 
ADD COLUMN category_id uuid REFERENCES public.categories(id);

-- Migrate existing data: map category enum values to category ids
UPDATE public.menu_items mi
SET category_id = c.id
FROM public.categories c
WHERE LOWER(c.name) = mi.category::text;

-- Add multi-language description columns
ALTER TABLE public.menu_items
ADD COLUMN description_ko text,
ADD COLUMN description_ja text,
ADD COLUMN description_cn text,
ADD COLUMN description_vi text,
ADD COLUMN description_ru text,
ADD COLUMN description_kz text;

-- Make category_id NOT NULL after migration (if you want to enforce it)
-- ALTER TABLE public.menu_items ALTER COLUMN category_id SET NOT NULL;

-- Drop the old category column (which uses enum)
ALTER TABLE public.menu_items DROP COLUMN category;

-- Drop the enum type
DROP TYPE IF EXISTS public.menu_category;