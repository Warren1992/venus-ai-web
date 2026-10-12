-- Lumi AI Web v3.5
-- Run in Supabase -> SQL Editor.
-- Threads, Memories, settings and Lumi care stats sync; photo files stay local.

create table if not exists public.lumi_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  threads jsonb not null default '[]'::jsonb,
  memories jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.lumi_sync enable row level security;

revoke all on table public.lumi_sync from anon;
grant select, insert, update, delete on table public.lumi_sync to authenticated;

drop policy if exists "Lumi users read own sync data" on public.lumi_sync;
drop policy if exists "Lumi users insert own sync data" on public.lumi_sync;
drop policy if exists "Lumi users update own sync data" on public.lumi_sync;
drop policy if exists "Lumi users delete own sync data" on public.lumi_sync;

create policy "Lumi users read own sync data"
on public.lumi_sync for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Lumi users insert own sync data"
on public.lumi_sync for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Lumi users update own sync data"
on public.lumi_sync for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Lumi users delete own sync data"
on public.lumi_sync for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
