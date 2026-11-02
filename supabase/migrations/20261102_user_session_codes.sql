-- One permanent session code per account. The viewbox row is deleted when a
-- session stops, so the code has to live on the user or the next session
-- would mint a new one. user_id is not a foreign key: some viewbox rows
-- belong to accounts that are no longer in auth.users, and their codes must
-- stay reserved.

create table public.user_session_codes (
  user_id uuid primary key,
  join_code text not null,
  constraint user_session_codes_join_code_key unique (join_code),
  constraint user_session_codes_join_code_format check (join_code ~ '^[A-Z]{5}$')
);

alter table public.user_session_codes enable row level security;

create policy "Users read their own session code"
  on public.user_session_codes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own session code"
  on public.user_session_codes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.user_session_codes to authenticated;
revoke all on public.user_session_codes from anon;

insert into public.user_session_codes (user_id, join_code)
select "user", join_code
from public.viewbox
on conflict (user_id) do nothing;
