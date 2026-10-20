-- Выполнить один раз в Supabase SQL Editor.
-- Меняет пароль существующего Auth-пользователя без пересоздания аккаунта.
-- Профиль, id, регистрации и RDC не затрагиваются.

create extension if not exists pgcrypto with schema extensions;

drop function if exists public.admin_reset_student_password(uuid, text);

create or replace function public.admin_reset_student_password(
  p_user_id uuid,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация';
  end if;

  select role into actor_role
  from public.profiles
  where id = auth.uid();

  if actor_role is distinct from 'admin' then
    raise exception 'Недостаточно прав: только администратор может менять пароль студента';
  end if;

  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'Пароль должен содержать минимум 8 символов';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user_id
    and not exists (
      select 1 from public.profiles p
      where p.id = p_user_id and p.role = 'admin'
    );

  if not found then
    raise exception 'Студент не найден или это администратор';
  end if;
end;
$$;

revoke all on function public.admin_reset_student_password(uuid, text) from public;
grant execute on function public.admin_reset_student_password(uuid, text) to authenticated;
