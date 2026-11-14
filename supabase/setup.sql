-- Run once in your project's Supabase SQL Editor. Safe to run again.
-- This is an intentionally public, no-login guest wall.
begin;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  body text not null check (char_length(body) <= 280),
  created_at timestamptz not null default now(),
  constraint posts_body_not_blank check (body ~ '[^[:space:]]')
);

create index if not exists posts_created_at_id_idx
  on public.posts (created_at desc, id desc);

alter table public.posts enable row level security;

-- Remove default table privileges, then expose only reading and posting.
revoke all on public.posts from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.posts to anon, authenticated;
grant insert (body, user_id) on public.posts to anon, authenticated;

drop policy if exists "Anyone can read wall posts" on public.posts;
create policy "Anyone can read wall posts" on public.posts
  for select to anon, authenticated using (true);

drop policy if exists "Anyone can share a wall post" on public.posts;
create policy "Anyone can share a wall post" on public.posts
  for insert to anon, authenticated
  with check (
    user_id is null
    and body is not null
    and char_length(body) between 1 and 280
    and body ~ '[^[:space:]]'
  );

-- Preserve any other tables already included in this publication.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end $$;

commit;
