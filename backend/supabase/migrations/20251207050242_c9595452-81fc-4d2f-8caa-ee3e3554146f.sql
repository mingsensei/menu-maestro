-- Drop the existing SELECT policy that uses a subquery
DROP POLICY IF EXISTS "Admins can view page views" ON public.page_views;

-- Recreate using the has_role function for consistency and security
CREATE POLICY "Admins can view page views" 
ON public.page_views 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'::app_role));