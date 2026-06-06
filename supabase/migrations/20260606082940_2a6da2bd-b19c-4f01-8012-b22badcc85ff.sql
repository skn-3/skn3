
-- Drop existing public policies for both buckets
DROP POLICY IF EXISTS "Public read case-images" ON storage.objects;
DROP POLICY IF EXISTS "Public insert case-images" ON storage.objects;
DROP POLICY IF EXISTS "Public update case-images" ON storage.objects;
DROP POLICY IF EXISTS "Public delete case-images" ON storage.objects;
DROP POLICY IF EXISTS "Public read sheet-metal-sketches" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload sheet-metal-sketches" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update sheet-metal-sketches" ON storage.objects;

-- Authenticated-only policies for case-images and sheet-metal-sketches
CREATE POLICY "auth read case/sheet buckets" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('case-images','sheet-metal-sketches'));

CREATE POLICY "auth insert case/sheet buckets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('case-images','sheet-metal-sketches'));

CREATE POLICY "auth update case/sheet buckets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('case-images','sheet-metal-sketches'))
  WITH CHECK (bucket_id IN ('case-images','sheet-metal-sketches'));

CREATE POLICY "auth delete case/sheet buckets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('case-images','sheet-metal-sketches'));
