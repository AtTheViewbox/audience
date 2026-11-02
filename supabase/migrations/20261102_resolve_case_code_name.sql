-- The search dropdown needs the case name. The code is still the secret.

create or replace function public.resolve_case_code(code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
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
