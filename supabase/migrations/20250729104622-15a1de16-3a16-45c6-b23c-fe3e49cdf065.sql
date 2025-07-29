-- Create storage bucket for profile images
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-images', 'profile-images', true);

-- Create policies for profile images
CREATE POLICY "Anyone can view profile images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'profile-images');

CREATE POLICY "Users can upload their own profile images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own profile images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own profile images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'profile-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add image_urls column to profiles table
ALTER TABLE public.profiles ADD COLUMN image_urls TEXT[] DEFAULT '{}';