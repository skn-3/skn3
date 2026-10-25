ALTER TABLE public.messages ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.messages ADD CONSTRAINT messages_attachments_check CHECK (jsonb_typeof(attachments)='array' AND jsonb_array_length(attachments)<=6);
ALTER TABLE public.messages DROP CONSTRAINT messages_body_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_body_check CHECK ((length(trim(body))>0 OR jsonb_array_length(attachments)>0) AND length(body)<=10000);
GRANT INSERT(conversation_id,sender_id,body,attachments) ON public.messages TO authenticated;
CREATE POLICY chat_images_member_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='chat-images' AND owner=auth.uid() AND public.is_conversation_member(((storage.foldername(name))[1])::uuid) AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp'));
CREATE POLICY chat_images_member_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id='chat-images' AND public.is_conversation_member(((storage.foldername(name))[1])::uuid));