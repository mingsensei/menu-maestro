-- Add new language columns for Spanish, French, and Italian
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS description_es text,
ADD COLUMN IF NOT EXISTS description_fr text,
ADD COLUMN IF NOT EXISTS description_it text;