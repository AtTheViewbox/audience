-- Case ids are digits only. Session codes are letters, so the two cannot match.

alter table public.playlists
  drop constraint if exists playlists_share_code_format;

alter table public.playlists
  add constraint playlists_share_code_format
  check (share_code is null or share_code ~ '^[0-9]{6}$');
