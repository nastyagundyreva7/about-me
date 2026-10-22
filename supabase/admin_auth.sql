-- RUD COIN admin API for the custom session system.
-- Run once in Supabase SQL Editor after custom_auth.sql.
-- Registration rewards are separate from attendance rewards.

alter table public.event_registrations
  add column if not exists registration_reward_status text not null default 'pending';
alter table public.event_registrations
  add column if not exists registration_coins_awarded integer not null default 0;

create or replace function public.rud_admin_id(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select p.id into v_id from public.rud_auth_sessions s join public.profiles p on p.id=s.profile_id
  where s.token=p_token and s.expires_at>now() and p.role='admin';
  if v_id is null then raise exception 'Доступ запрещён. Нужны права администратора.'; end if;
  return v_id;
end; $$;

create or replace function public.rud_admin_stats(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_users bigint; v_events bigint; v_regs bigint; v_coins bigint;
begin
  v_admin:=public.rud_admin_id(p_token);
  select count(*) into v_users from public.profiles where role<>'admin' or role is null;
  select count(*) into v_events from public.events;
  select count(*) into v_regs from public.event_registrations;
  select coalesce(sum(coins),0) into v_coins from public.profiles;
  return jsonb_build_object('users',v_users,'events',v_events,'registrations',v_regs,'coins',v_coins);
end; $$;

create or replace function public.rud_admin_users(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_rows jsonb;
begin
  v_admin:=public.rud_admin_id(p_token);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_name,x.first_name),'[]'::jsonb) into v_rows
  from (select id,last_name,first_name,middle_name,student_group,rudn_email,role,coins from public.profiles) x;
  return v_rows;
end; $$;

create or replace function public.rud_admin_registrations(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_rows jsonb;
begin
  v_admin:=public.rud_admin_id(p_token);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'status',r.status,'coins_awarded',r.coins_awarded,
    'registration_reward_status',r.registration_reward_status,'registration_coins_awarded',r.registration_coins_awarded,
    'registered_at',r.registered_at,
    'student',jsonb_build_object('id',p.id,'name',concat_ws(' ',p.last_name,p.first_name,p.middle_name),'email',p.rudn_email,'group',p.student_group),
    'event',jsonb_build_object('id',e.id,'title',e.title,'event_date',e.event_date,'base_coins',e.base_coins)
  ) order by r.registered_at desc),'[]'::jsonb) into v_rows
  from public.event_registrations r left join public.profiles p on p.id=r.student_id left join public.events e on e.id=r.event_id;
  return v_rows;
end; $$;

create or replace function public.rud_admin_create_event(p_token text,p_title text,p_date date,p_category text,p_level text,p_coins integer,p_location text,p_description text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_event public.events%rowtype;
begin
  v_admin:=public.rud_admin_id(p_token);
  if trim(coalesce(p_title,''))='' then raise exception 'Укажите название мероприятия.'; end if;
  if p_coins<1 or p_coins>20 then raise exception 'Базовая награда должна быть от 1 до 20 RDC.'; end if;
  insert into public.events(title,event_date,category,event_level,base_coins,location,description)
  values(trim(p_title),p_date,trim(p_category),trim(p_level),p_coins,trim(coalesce(p_location,'')),trim(coalesce(p_description,''))) returning * into v_event;
  return to_jsonb(v_event);
end; $$;

create or replace function public.rud_admin_approve_registration_reward(p_token text,p_registration_id bigint,p_amount integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_student uuid; v_status text; v_amount integer;
begin
  v_admin:=public.rud_admin_id(p_token);
  if p_amount is null or p_amount<1 or p_amount>1000 then raise exception 'Количество RDC должно быть от 1 до 1000.'; end if;
  select student_id,registration_reward_status into v_student,v_status
  from public.event_registrations where id=p_registration_id for update;
  if v_student is null then raise exception 'Регистрация не найдена.'; end if;
  if v_status='approved' then raise exception 'Коины за регистрацию уже начислены.'; end if;
  if v_status='rejected' then raise exception 'Начисление за регистрацию уже отклонено.'; end if;
  v_amount:=p_amount;
  update public.event_registrations
    set registration_reward_status='approved',registration_coins_awarded=v_amount
    where id=p_registration_id;
  update public.profiles set coins=coalesce(coins,0)+v_amount where id=v_student;
  return v_amount;
end; $$;

create or replace function public.rud_admin_reject_registration_reward(p_token text,p_registration_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_status text;
begin
  v_admin:=public.rud_admin_id(p_token);
  select registration_reward_status into v_status from public.event_registrations where id=p_registration_id for update;
  if not found then raise exception 'Регистрация не найдена.'; end if;
  if v_status='approved' then raise exception 'Нельзя отклонить уже начисленные коины.'; end if;
  update public.event_registrations set registration_reward_status='rejected',registration_coins_awarded=0 where id=p_registration_id;
  return true;
end; $$;

create or replace function public.rud_admin_confirm_attendance(p_token text,p_registration_id bigint)
returns integer language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_student uuid; v_amount integer; v_status text;
begin
  v_admin:=public.rud_admin_id(p_token);
  select r.student_id,coalesce(e.base_coins,0),r.status into v_student,v_amount,v_status
  from public.event_registrations r join public.events e on e.id=r.event_id
  where r.id=p_registration_id for update;
  if v_student is null then raise exception 'Регистрация не найдена.'; end if;
  if v_status in ('attended','confirmed','completed') then raise exception 'Присутствие уже подтверждено.'; end if;
  update public.event_registrations set status='attended',coins_awarded=v_amount where id=p_registration_id;
  update public.profiles set coins=coalesce(coins,0)+v_amount where id=v_student;
  return v_amount;
end; $$;

revoke all on function public.rud_admin_stats(text) from public,authenticated;
revoke all on function public.rud_admin_users(text) from public,authenticated;
revoke all on function public.rud_admin_registrations(text) from public,authenticated;
revoke all on function public.rud_admin_create_event(text,text,date,text,text,integer,text,text) from public,authenticated;
revoke all on function public.rud_admin_approve_registration_reward(text,bigint,integer) from public,authenticated;
revoke all on function public.rud_admin_reject_registration_reward(text,bigint) from public,authenticated;
revoke all on function public.rud_admin_confirm_attendance(text,bigint) from public,authenticated;
grant execute on function public.rud_admin_stats(text) to anon;
grant execute on function public.rud_admin_users(text) to anon;
grant execute on function public.rud_admin_registrations(text) to anon;
grant execute on function public.rud_admin_create_event(text,text,date,text,text,integer,text,text) to anon;
grant execute on function public.rud_admin_approve_registration_reward(text,bigint,integer) to anon;
grant execute on function public.rud_admin_reject_registration_reward(text,bigint) to anon;
grant execute on function public.rud_admin_confirm_attendance(text,bigint) to anon;
