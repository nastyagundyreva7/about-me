-- Run this ONCE in Supabase SQL Editor after the base schema.
-- It hardens student/admin permissions and moves coin changes into server-side functions.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Students must not be able to change role or coin balance directly.
drop policy if exists "Students can update own profile" on public.profiles;

create policy "Users can view own profile or admins can view all"
on public.profiles for select to authenticated
using (auth.uid() = id or public.is_admin());

create policy "Admins can manage profiles"
on public.profiles for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Registration trigger: creates a profile when Supabase Auth creates a user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id,last_name,first_name,middle_name,student_group,rudn_email,role,coins)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'last_name',''),
    coalesce(new.raw_user_meta_data->>'first_name',''),
    nullif(new.raw_user_meta_data->>'middle_name',''),
    coalesce(new.raw_user_meta_data->>'student_group',''),
    lower(new.email),
    'student',
    0
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Students can register themselves for an event.
drop policy if exists "Students can register for events" on public.event_registrations;
create policy "Students can register for events"
on public.event_registrations for insert to authenticated
with check (student_id = auth.uid());

-- Admins can see and manage every registration.
create policy "Admins can view all registrations"
on public.event_registrations for select to authenticated
using (student_id = auth.uid() or public.is_admin());

create policy "Admins can update registrations"
on public.event_registrations for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Admins can view all coin transactions.
create policy "Admins can view all transactions"
on public.coin_transactions for select to authenticated
using (student_id = auth.uid() or public.is_admin());

-- Admins can view and manage all redemptions.
create policy "Admins can view all redemptions"
on public.redemptions for select to authenticated
using (student_id = auth.uid() or public.is_admin());

create policy "Admins can update redemptions"
on public.redemptions for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Admins can create/update/delete events and privileges.
create policy "Admins can insert events"
on public.events for insert to authenticated
with check (public.is_admin());
create policy "Admins can update events"
on public.events for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete events"
on public.events for delete to authenticated
using (public.is_admin());

create policy "Admins can insert privileges"
on public.privileges for insert to authenticated
with check (public.is_admin());
create policy "Admins can update privileges"
on public.privileges for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Secure attendance confirmation and coin award.
create or replace function public.confirm_event_attendance(p_registration_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.event_registrations%rowtype;
  base integer;
  awarded integer;
  new_balance integer;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into r from public.event_registrations where id=p_registration_id for update;
  if not found then raise exception 'Registration not found'; end if;
  if r.status='attended' then return r.coins_awarded; end if;
  select base_coins into base from public.events where id=r.event_id;
  awarded := round(base * coalesce(r.participation_coefficient,1));
  update public.event_registrations
  set status='attended', coins_awarded=awarded, confirmed_at=now()
  where id=p_registration_id;
  update public.profiles
  set coins=coins+awarded
  where id=r.student_id
  returning coins into new_balance;
  insert into public.coin_transactions(student_id,amount,transaction_type,description,event_id)
  select r.student_id,awarded,'event_reward','Начисление за: '||e.title,r.event_id
  from public.events e where e.id=r.event_id;
  return awarded;
end;
$$;

-- Secure redemption: deducts coins atomically and creates a redemption request.
create or replace function public.request_redemption(p_privilege_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.privileges%rowtype;
  balance integer;
  rid bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into p from public.privileges where id=p_privilege_id and available=true;
  if not found then raise exception 'Privilege not found'; end if;
  select coins into balance from public.profiles where id=auth.uid() for update;
  if balance < p.price_coins then raise exception 'Недостаточно RDC'; end if;
  update public.profiles set coins=coins-p.price_coins where id=auth.uid();
  insert into public.redemptions(student_id,privilege_id,price_coins,status)
  values(auth.uid(),p.id,p.price_coins,'pending') returning id into rid;
  insert into public.coin_transactions(student_id,amount,transaction_type,description)
  values(auth.uid(),-p.price_coins,'privilege_exchange','Обмен на: '||p.title);
  return rid;
end;
$$;

grant execute on function public.confirm_event_attendance(bigint) to authenticated;
grant execute on function public.request_redemption(bigint) to authenticated;

-- Keep admins from being exposed to anonymous users.
revoke all on public.profiles from anon;
revoke all on public.event_registrations from anon;
revoke all on public.coin_transactions from anon;
revoke all on public.redemptions from anon;
