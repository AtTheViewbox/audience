-- Suggestion list for the share dialog. Signed-in accounts can see other
-- accounts' email and name. Anonymous sessions cannot, and nobody sees themselves.

create or replace function public.share_suggest_users()
returns table (email text, name text)
language sql
stable
security definer
set search_path = auth, public
as $$
  select u.email::text,
    nullif(btrim(coalesce(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      ''
    )), '') as name
  from auth.users u
  where auth.uid() is not null
    and exists (
      select 1
      from auth.users me
      where me.id = auth.uid()
        and coalesce(me.is_anonymous, false) = false
    )
    and u.email is not null
    and coalesce(u.is_anonymous, false) = false
    and u.id is distinct from auth.uid()
  order by lower(u.email)
  limit 30;
$$;

revoke all on function public.share_suggest_users() from public;
revoke all on function public.share_suggest_users() from anon;
revoke all on function public.share_suggest_users() from authenticated;
grant execute on function public.share_suggest_users() to authenticated;
