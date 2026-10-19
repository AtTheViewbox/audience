-- Secret link token so a case can be opened by anyone holding the link,
-- even when the case and its studies are private.
-- Applied remotely as migration playlist_share_token.

alter table public.playlists
  add column if not exists share_token uuid unique;
