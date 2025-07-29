-- Fix the function search path security issue
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY definer SET search_path = 'public'
AS $$
BEGIN
  -- Don't create profile automatically, let user fill it via registration form
  RETURN NEW;
END;
$$;