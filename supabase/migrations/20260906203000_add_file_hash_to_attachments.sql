-- Adiciona coluna file_hash na tabela attachments para detecção anti-golpe de comprovantes repetidos
alter table public.attachments add column if not exists file_hash text;
create index if not exists idx_attachments_file_hash on public.attachments (file_hash);
