-- POSER v5: every coin picture is stored once at coin-images/<mint>.webp
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coin-images', 'coin-images', true, 1048576, array['image/webp','image/png','image/jpeg','image/gif'])
on conflict (id) do update set public = true;