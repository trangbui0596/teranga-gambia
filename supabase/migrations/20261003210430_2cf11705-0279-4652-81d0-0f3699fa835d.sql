REVOKE EXECUTE ON FUNCTION public.assign_first_champion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
CREATE POLICY "champion reads recordings files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='recordings' AND public.has_role(auth.uid(),'champion'));
CREATE POLICY "champion uploads recordings files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='recordings' AND public.has_role(auth.uid(),'champion'));
CREATE POLICY "champion updates recordings files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='recordings' AND public.has_role(auth.uid(),'champion'));