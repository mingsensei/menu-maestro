-- First, add new values to the menu_category enum
ALTER TYPE menu_category ADD VALUE IF NOT EXISTS 'pasta';
ALTER TYPE menu_category ADD VALUE IF NOT EXISTS 'pizza';
ALTER TYPE menu_category ADD VALUE IF NOT EXISTS 'calzone';
ALTER TYPE menu_category ADD VALUE IF NOT EXISTS 'gnocchi';
ALTER TYPE menu_category ADD VALUE IF NOT EXISTS 'special';
ALTER TYPE menu_category ADD VALUE IF NOT EXISTS 'cocktail';
ALTER TYPE menu_category ADD VALUE IF NOT EXISTS 'mocktail';
ALTER TYPE menu_category ADD VALUE IF NOT EXISTS 'soft_drink';
ALTER TYPE menu_category ADD VALUE IF NOT EXISTS 'spirit';
ALTER TYPE menu_category ADD VALUE IF NOT EXISTS 'starter';
ALTER TYPE menu_category ADD VALUE IF NOT EXISTS 'coffee';

-- Create categories table for better category management
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- RLS policies for categories
CREATE POLICY "Anyone can view categories"
ON public.categories
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert categories"
ON public.categories
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update categories"
ON public.categories
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete categories"
ON public.categories
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default categories
INSERT INTO public.categories (name, display_name, display_order) VALUES
('starter', 'Starter', 1),
('pasta', 'Pasta', 2),
('pizza', 'Pizza', 3),
('calzone', 'Calzone', 4),
('gnocchi', 'Gnocchi', 5),
('special', 'Special', 6),
('dessert', 'Dessert', 7),
('coffee', 'Coffee', 8),
('cocktail', 'Cocktail', 9),
('mocktail', 'Mocktail', 10),
('soft_drink', 'Soft Drink', 11),
('spirit', 'Spirit', 12);