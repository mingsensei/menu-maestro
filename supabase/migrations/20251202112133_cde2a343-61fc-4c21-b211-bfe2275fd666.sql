-- Fix RLS on user_roles to avoid recursive policy issues that block admin checks

-- Drop the problematic policy that references user_roles from within its own RLS expression
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;