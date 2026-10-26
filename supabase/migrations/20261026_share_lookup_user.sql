-- Email lookup for sharing a study into another account's viewbox.
-- Only the edge function (service role) may call this. Authenticated clients
-- cannot enumerate accounts by email.

create or replace function public.share_lookup_user(target_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select id
  from auth.users
  where email is not null
    and lower(email) = lower(btrim(target_email))
  limit 1;
$$;

revoke all on function public.share_lookup_user(text) from public;
revoke all on function public.share_lookup_user(text) from anon;
revoke all on function public.share_lookup_user(text) from authenticated;
grant execute on function public.share_lookup_user(text) to service_role;
