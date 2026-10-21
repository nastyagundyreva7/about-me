-- Run once after custom_auth.sql.
-- Imports existing Supabase users into RUD COIN auth without requiring Supabase Auth for login.
create or replace function public.rud_login(p_email text,p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_email text := lower(trim(p_email));
  v_account public.rud_auth_accounts%rowtype;
  v_auth auth.users%rowtype;
  v_token text;
  v_profile public.profiles%rowtype;
begin
  delete from public.rud_auth_sessions where expires_at < now();

  select * into v_account from public.rud_auth_accounts where email=v_email;

  if not found then
    select * into v_auth from auth.users where lower(email)=v_email limit 1;
    if not found or coalesce(v_auth.encrypted_password,'')='' then
      raise exception 'Неверная почта или пароль';
    end if;
    if extensions.crypt(p_password,v_auth.encrypted_password) <> v_auth.encrypted_password then
      raise exception 'Неверная почта или пароль';
    end if;
    select * into v_profile from public.profiles where id=v_auth.id;
    if not found then
      raise exception 'Профиль пользователя не найден';
    end if;
    insert into public.rud_auth_accounts(profile_id,email,password_hash)
    values(v_profile.id,v_email,v_auth.encrypted_password)
    on conflict(profile_id) do update set email=excluded.email,password_hash=excluded.password_hash,updated_at=now();
    select * into v_account from public.rud_auth_accounts where profile_id=v_profile.id;
  else
    if extensions.crypt(p_password,v_account.password_hash) <> v_account.password_hash then
      raise exception 'Неверная почта или пароль';
    end if;
    select * into v_profile from public.profiles where id=v_account.profile_id;
    if not found then raise exception 'Профиль пользователя не найден'; end if;
  end if;

  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.rud_auth_sessions(token,profile_id) values(v_token,v_profile.id);
  return jsonb_build_object('token',v_token,'profile',to_jsonb(v_profile));
end; $$;

revoke all on function public.rud_login(text,text) from public, authenticated;
grant execute on function public.rud_login(text,text) to anon;
