-- RUD COIN custom authentication migration.
-- This file is intended to be executed once in Supabase SQL Editor.
-- It creates the application session tables and RPC API without exposing them directly.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.rud_auth_accounts (
  profile_id uuid primary key,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rud_auth_sessions (
  token text primary key,
  profile_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists rud_auth_sessions_profile_idx on public.rud_auth_sessions(profile_id);
create index if not exists rud_auth_sessions_expires_idx on public.rud_auth_sessions(expires_at);

alter table public.rud_auth_accounts enable row level security;
alter table public.rud_auth_sessions enable row level security;
revoke all on public.rud_auth_accounts from anon, authenticated;
revoke all on public.rud_auth_sessions from anon, authenticated;

create or replace function public.rud_register(
  p_email text, p_password text, p_last text, p_first text, p_middle text, p_group text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_email text := lower(trim(p_email)); v_id uuid; v_token text; v_hash text; v_profile public.profiles%rowtype;
begin
  if v_email !~ '^[^[:space:]@]+@rudn\\.ru$' then raise exception 'Используйте почту РУДН в формате name@rudn.ru'; end if;
  if length(p_password) < 8 then raise exception 'Пароль должен содержать минимум 8 символов'; end if;
  if trim(coalesce(p_last,''))='' or trim(coalesce(p_first,''))='' or trim(coalesce(p_group,''))='' then raise exception 'Заполните фамилию, имя и группу'; end if;
  if exists(select 1 from public.rud_auth_accounts where email=v_email) then raise exception 'Аккаунт с этой почтой уже зарегистрирован. Войдите в него.'; end if;
  v_id := gen_random_uuid();
  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  insert into public.profiles(id,last_name,first_name,middle_name,student_group,rudn_email,role,coins)
  values(v_id,trim(p_last),trim(p_first),trim(coalesce(p_middle,'')),trim(p_group),v_email,'student',0);
  insert into public.rud_auth_accounts(profile_id,email,password_hash) values(v_id,v_email,v_hash);
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.rud_auth_sessions(token,profile_id) values(v_token,v_id);
  select * into v_profile from public.profiles where id=v_id;
  return jsonb_build_object('token',v_token,'profile',to_jsonb(v_profile));
end; $$;

create or replace function public.rud_login(p_email text,p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_account public.rud_auth_accounts%rowtype; v_token text; v_profile public.profiles%rowtype;
begin
  delete from public.rud_auth_sessions where expires_at<now();
  select * into v_account from public.rud_auth_accounts where email=lower(trim(p_email));
  if not found or extensions.crypt(p_password,v_account.password_hash)<>v_account.password_hash then raise exception 'Неверная почта или пароль'; end if;
  select * into v_profile from public.profiles where id=v_account.profile_id;
  if not found then raise exception 'Профиль пользователя не найден'; end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.rud_auth_sessions(token,profile_id) values(v_token,v_profile.id);
  return jsonb_build_object('token',v_token,'profile',to_jsonb(v_profile));
end; $$;

create or replace function public.rud_restore(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_profile public.profiles%rowtype;
begin
  select p.* into v_profile from public.rud_auth_sessions s join public.profiles p on p.id=s.profile_id where s.token=p_token and s.expires_at>now();
  if not found then return null; end if;
  update public.rud_auth_sessions set expires_at=now()+interval '30 days' where token=p_token;
  return jsonb_build_object('profile',to_jsonb(v_profile));
end; $$;

create or replace function public.rud_logout(p_token text) returns boolean
language sql security definer set search_path = public as $$ delete from public.rud_auth_sessions where token=p_token; select true; $$;

create or replace function public.rud_wallet(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_profile jsonb; v_regs jsonb; v_history jsonb;
begin
  select profile_id into v_id from public.rud_auth_sessions where token=p_token and expires_at>now();
  if v_id is null then raise exception 'Сессия истекла. Войдите снова.'; end if;
  select to_jsonb(p) into v_profile from public.profiles p where p.id=v_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'coins_awarded',r.coins_awarded,'registered_at',r.registered_at,'events',jsonb_build_object('title',e.title,'event_date',e.event_date,'location',e.location,'base_coins',e.base_coins)) order by r.registered_at desc),'[]'::jsonb) into v_regs from public.event_registrations r left join public.events e on e.id=r.event_id where r.student_id=v_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_history from (select * from public.coin_transactions where student_id=v_id order by created_at desc limit 30) x;
  return jsonb_build_object('profile',v_profile,'registrations',v_regs,'history',v_history);
end; $$;

create or replace function public.rud_register_event(p_token text,p_event_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select profile_id into v_id from public.rud_auth_sessions where token=p_token and expires_at>now();
  if v_id is null then raise exception 'Сессия истекла. Войдите снова.'; end if;
  insert into public.event_registrations(student_id,event_id,status) values(v_id,p_event_id,'registered');
  return true;
exception when unique_violation then raise exception 'Вы уже зарегистрированы на это мероприятие.';
end; $$;

revoke all on function public.rud_register(text,text,text,text,text,text) from public, authenticated;
grant execute on function public.rud_register(text,text,text,text,text,text) to anon;
revoke all on function public.rud_login(text,text) from public, authenticated;
grant execute on function public.rud_login(text,text) to anon;
revoke all on function public.rud_restore(text) from public, authenticated;
grant execute on function public.rud_restore(text) to anon;
revoke all on function public.rud_logout(text) from public, authenticated;
grant execute on function public.rud_logout(text) to anon;
revoke all on function public.rud_wallet(text) from public, authenticated;
grant execute on function public.rud_wallet(text) to anon;
revoke all on function public.rud_register_event(text,bigint) from public, authenticated;
grant execute on function public.rud_register_event(text,bigint) to anon;
