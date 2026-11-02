-- Short id for a case share link. The copied URL is ?case:CODE, which
-- stays searchable in the browser. The code is the secret: the link is off
-- when share_token is null.

alter table public.playlists
  add column if not exists share_code text;

create unique index if not exists playlists_share_code_key
  on public.playlists (share_code);

alter table public.playlists
  drop constraint if exists playlists_share_code_format;

alter table public.playlists
  add constraint playlists_share_code_format
  check (share_code is null or share_code ~ '^[0-9]{6}$');

create or replace function public.resolve_case_code(code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'share_token', p.share_token,
    'study_id', s.id,
    'url_params', s.url_params
  )
  from public.playlists p
  join public.playlist_items i on i.playlist_id = p.id
  join public.studies s on s.id = i.study_id
  where p.share_code = upper(btrim(code))
    and p.share_token is not null
    and s.url_params is not null
  order by i.sort_order asc
  limit 1;
$$;

revoke all on function public.resolve_case_code(text) from public;
revoke all on function public.resolve_case_code(text) from anon;
revoke all on function public.resolve_case_code(text) from authenticated;
grant execute on function public.resolve_case_code(text) to anon, authenticated;
