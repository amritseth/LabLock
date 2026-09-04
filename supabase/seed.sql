-- LabLock — seed data. v1 has exactly ONE resource (handbook §4:
-- one lab, one resource).
--
-- The id is fixed so the API response is stable between environments;
-- guides and example responses in the handbook use the slug project-lab.

insert into public.resources (id, slug, name, tz, slot_length_minutes, is_active)
values (
  '00000000-0000-0000-0000-000000000001',
  'project-lab',
  'Project Lab',
  'Asia/Kolkata',
  60,
  true
)
on conflict (slug) do nothing;
