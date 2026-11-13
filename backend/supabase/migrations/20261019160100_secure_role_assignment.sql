-- Existing admins keep their roles. New signups must never gain admin access automatically.
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

-- The security-definer signup trigger does not need a public insert bypass.
DROP POLICY IF EXISTS "Allow trigger insert" ON public.user_roles;
