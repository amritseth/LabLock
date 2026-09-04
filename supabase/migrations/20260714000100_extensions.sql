-- LabLock — extensions. pgcrypto is pre-installed on Supabase; this keeps
-- local plain-Postgres bootstraps in step for gen_random_uuid().

create extension if not exists pgcrypto with schema extensions;
