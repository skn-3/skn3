
-- Add image_urls column to deviations
ALTER TABLE public.deviations ADD COLUMN image_urls text[] DEFAULT '{}';

-- Create storage bucket for case images
INSERT INTO storage.buckets (id, name, public) VALUES ('case-images', 'case-images', true);

-- Allow all access on case-images bucket (no RLS)
CREATE POLICY "Public read case-images" ON storage.objects FOR SELECT USING (bucket_id = 'case-images');
CREATE POLICY "Public insert case-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'case-images');
CREATE POLICY "Public update case-images" ON storage.objects FOR UPDATE USING (bucket_id = 'case-images');
CREATE POLICY "Public delete case-images" ON storage.objects FOR DELETE USING (bucket_id = 'case-images');
