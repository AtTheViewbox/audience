-- Applied remotely as migration playlist_indication.
-- Case indication/history shown in the viewer history panel.

alter table public.playlists
  add column if not exists indication text;

comment on column public.playlists.indication is
  'Clinical indication and history shown in the viewer history panel for this case.';
