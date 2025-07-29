-- Create enums for the dating app
CREATE TYPE public.gender_type AS ENUM ('hombre', 'mujer', 'no_binario', 'otro');
CREATE TYPE public.orientation_type AS ENUM ('heterosexual', 'homosexual', 'bisexual', 'pansexual', 'asexual', 'otro');
CREATE TYPE public.looking_for_type AS ENUM ('pareja', 'amistad', 'casual', 'red_social');

-- Create profiles table for dating app users
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 18 AND age <= 100),
  gender gender_type NOT NULL,
  orientation orientation_type NOT NULL,
  looking_for looking_for_type NOT NULL,
  description TEXT,
  
  -- Matching preferences
  min_age_preference INTEGER NOT NULL CHECK (min_age_preference >= 18 AND min_age_preference <= 100),
  max_age_preference INTEGER NOT NULL CHECK (max_age_preference >= 18 AND max_age_preference <= 100),
  gender_preferences gender_type[] NOT NULL DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure min_age_preference <= max_age_preference
  CONSTRAINT valid_age_range CHECK (min_age_preference <= max_age_preference)
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own profile" 
ON public.profiles 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY definer SET search_path = ''
AS $$
BEGIN
  -- Don't create profile automatically, let user fill it via registration form
  RETURN NEW;
END;
$$;