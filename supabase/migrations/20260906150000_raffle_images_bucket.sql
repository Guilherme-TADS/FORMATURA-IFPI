-- Bucket público para imagens e banners das rifas
insert into storage.buckets (id, name, public)
values ('raffle-images', 'raffle-images', true)
on conflict (id) do update set public = true;

drop policy if exists raffle_images_public_read on storage.objects;
create policy raffle_images_public_read on storage.objects
  for select
  using (bucket_id = 'raffle-images');

drop policy if exists raffle_images_admin_insert on storage.objects;
create policy raffle_images_admin_insert on storage.objects
  for insert
  with check (bucket_id = 'raffle-images' and public.is_active_admin());

drop policy if exists raffle_images_admin_delete on storage.objects;
create policy raffle_images_admin_delete on storage.objects
  for delete
  using (bucket_id = 'raffle-images' and public.is_active_admin());
