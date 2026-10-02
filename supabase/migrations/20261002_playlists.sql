-- Group studies into a case playlist (XR / CT / MR of the same case).
-- Applied remotely as migration create_playlists.

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  description text,
  visibility public.visibility not null default 'PRIVATE',
  created_at timestamptz not null default now()
);

create table if not exists public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  study_id uuid not null references public.studies (id) on delete cascade,
  sort_order integer not null default 0,
  label text,
  unique (playlist_id, study_id)
);

create index if not exists playlist_items_playlist_sort_idx
  on public.playlist_items (playlist_id, sort_order);

alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
