/* RUD COIN auth reliability patch.
   Uses Supabase Auth REST directly instead of relying on supabase-js auth methods.
   Existing profiles, balances, events and transactions remain untouched. */
(() => {
  const SUPABASE_AUTH_URL = 'https://crpmabmarisoptxtszds.supabase.co/auth/v1';
  const SUPABASE_KEY = 'sb_publishable_kE-z8sxcQfX3ojxbjzepzQ_PbZEWMM6';
  const redirectUrl = () => `${location.origin}${location.pathname}`;
  const normalizeEmail = value => String(value || '').trim().toLowerCase();

  const message = error => {
    const text = String(error?.message || error || 'Неизвестная ошибка');
    if (/invalid login credentials/i.test(text)) return 'Неверная почта или пароль.';
    if (/email not confirmed/i.test(text)) return 'Почта ещё не подтверждена. Можно отправить письмо подтверждения ещё раз.';
    if (/user already registered|already been registered/i.test(text)) return 'Аккаунт с этой почтой уже зарегистрирован. Войдите в него.';
    if (/too many requests|rate limit/i.test(text)) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
    if (/failed to fetch|network|fetch/i.test(text)) return 'Не удалось связаться с сервисом авторизации. Попробуйте ещё раз через несколько секунд.';
    return text;
  };

  async function authFetch(path, options = {}, retries = 3) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`${SUPABASE_AUTH_URL}${path}`, {
          ...options,
          signal: controller.signal,
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
          }
        });
        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = { message: text }; }
        if (response.ok) return { data, error: null };
        const error = new Error(data?.msg || data?.message || data?.error_description || `Auth HTTP ${response.status}`);
        error.status = response.status;
        error.code = data?.code;
        if (response.status >= 500 && attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
          continue;
        }
        return { data: null, error };
      } catch (error) {
        lastError = error;
        if (attempt < retries - 1) await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
    return { data: null, error: lastError || new Error('Auth request failed') };
  }

  async function applySession(session) {
    if (!session?.access_token || !session?.refresh_token) throw new Error('Сервис авторизации не вернул полноценную сессию.');
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
    if (error) throw error;
    return refreshUserSafe();
  }

  async function refreshUserSafe() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      currentUser = user || null;
      currentProfile = null;
      if (currentUser) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
        currentProfile = profile || null;
      }
      if (typeof updateHeader === 'function') updateHeader();
      if (currentUser) {
        if (typeof loadWallet === 'function') await loadWallet();
        if (typeof loadProfile === 'function') await loadProfile();
      }
      return currentUser;
    } catch (error) {
      console.error('RUD COIN auth refresh:', error);
      return null;
    }
  }

  async function resendConfirmation(email) {
    email = normalizeEmail(email);
    if (!email) return toast('Введите почту РУДН.');
    const { error } = await authFetch('/resend', {
      method: 'POST',
      body: JSON.stringify({ type: 'signup', email, options: { email_redirect_to: redirectUrl() } })
    });
    if (error) return toast(message(error));
    toast('Письмо подтверждения отправлено ещё раз. Проверьте входящие и папку «Спам».', true);
  }
  window.resendConfirmation = resendConfirmation;

  async function resetPassword() {
    const input = document.getElementById('loginEmail');
    const email = normalizeEmail(input?.value);
    if (!email) return toast('Сначала введите почту РУДН.');
    const { error } = await authFetch('/recover', {
      method: 'POST',
      body: JSON.stringify({ email, gotrue_meta_security: {} })
    });
    if (error) return toast(message(error));
    toast('Письмо для восстановления пароля отправлено на почту.', true);
  }
  window.resetRudPassword = resetPassword;

  window.registerStudent = async function registerStudentFixed(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = normalizeEmail(data.get('email'));
    const password = String(data.get('password') || '');
    const last = String(data.get('last') || '').trim();
    const first = String(data.get('first') || '').trim();
    const middle = String(data.get('middle') || '').trim();
    const group = String(data.get('group') || '').trim();

    if (!/^[^\s@]+@rudn\.ru$/i.test(email)) return toast('Используйте почту РУДН в формате name@rudn.ru.');
    if (password.length < 8) return toast('Пароль должен содержать минимум 8 символов.');
    if (!last || !first || !group) return toast('Заполните фамилию, имя и группу.');

    const submit = form.querySelector('button[type="submit"]');
    if (submit) { submit.disabled = true; submit.dataset.oldText = submit.textContent; submit.textContent = 'Создаём аккаунт…'; }
    try {
      const { data: result, error } = await authFetch('/signup', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          data: { last_name: last, first_name: first, middle_name: middle, student_group: group },
          gotrue_meta_security: {}
        })
      });
      if (error) return toast(message(error));

      form.reset();
      if (result?.access_token && result?.refresh_token) {
        await applySession(result);
        toast('Аккаунт создан. Добро пожаловать в RUD COIN!', true);
        show('profile');
      } else {
        toast('Аккаунт создан. Откройте письмо РУДН и подтвердите почту, затем войдите.', true);
        show('login');
        const loginEmail = document.getElementById('loginEmail');
        if (loginEmail) loginEmail.value = email;
        const box = document.getElementById('loginFormNotice');
        if (box) box.innerHTML = '<button type="button" class="linkButton" onclick="resendConfirmation(document.getElementById(\'loginEmail\').value)">Отправить письмо подтверждения ещё раз</button>';
      }
    } catch (error) {
      toast(message(error));
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = submit.dataset.oldText || 'Создать аккаунт'; }
    }
  };

  window.demoLogin = async function demoLoginFixed(event) {
    if (event) event.preventDefault();
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const email = normalizeEmail(emailInput?.value);
    const password = String(passwordInput?.value || '');
    if (!email || !password) return toast('Введите почту и пароль.');
    if (!/^[^\s@]+@rudn\.ru$/i.test(email)) return toast('Используйте почту РУДН в формате name@rudn.ru.');

    const button = document.querySelector('#login form button[type="submit"]');
    if (button) { button.disabled = true; button.dataset.oldText = button.textContent; button.textContent = 'Входим…'; }
    try {
      const { data, error } = await authFetch('/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (error) {
        const text = String(error.message || '');
        if (/email not confirmed/i.test(text)) {
          const box = document.getElementById('loginFormNotice');
          if (box) box.innerHTML = '<button type="button" class="linkButton" onclick="resendConfirmation(document.getElementById(\'loginEmail\').value)">Отправить письмо подтверждения ещё раз</button>';
        }
        return toast(message(error));
      }
      if (!data?.access_token || !data?.refresh_token) return toast('Не удалось создать сессию. Попробуйте войти ещё раз.');
      await applySession(data);
      toast('Вход выполнен. Баланс загружен.', true);
      show('wallet');
    } catch (error) {
      toast(message(error));
    } finally {
      if (button) { button.disabled = false; button.textContent = button.dataset.oldText || 'Войти'; }
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.querySelector('#login form');
    if (loginForm) {
      const oldNotice = loginForm.querySelector('.notice');
      if (oldNotice) oldNotice.id = 'loginFormNotice';
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'linkButton';
      reset.textContent = 'Забыли пароль?';
      reset.addEventListener('click', resetPassword);
      loginForm.appendChild(reset);
    }

    // Give mobile browsers time to restore IndexedDB/localStorage before asking for the user.
    setTimeout(() => refreshUserSafe(), 150);
  });
})();
