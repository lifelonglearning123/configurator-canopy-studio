-- =============================================================
-- Lead renders: a picture of the exact configured build travels
-- with every quote request (hi-res snapshot of the live view, or
-- the path-traced photo when one was on screen).
-- =============================================================

alter table leads add column if not exists render_url text;

-- Public bucket for the renders. The lead route uploads with the service
-- role (bypasses RLS); readers use the public object URL, which needs no
-- policy on a public bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('renders', 'renders', true, 3145728, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
