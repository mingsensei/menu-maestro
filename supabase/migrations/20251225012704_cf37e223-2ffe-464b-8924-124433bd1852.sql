-- Add VAT column to menu_items table
ALTER TABLE public.menu_items 
ADD COLUMN vat numeric NOT NULL DEFAULT 0;