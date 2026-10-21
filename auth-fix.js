/* RUD COIN auth/mobile reliability patch. Keeps the existing Supabase data and UI. */
(() => {
  const redirectUrl = () => `${location.origin}${location.pathname}`;
  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const message = error => {
    const text = String(error?.message || error || 'Неизвестная ошибка');
    if (/invalid login credentials/i.test(text)) return 'Неверная почта или пароль.';
    if (/email not confirmed/i.test(text)) return 'Почта ещё не подтверждена. Ниже можно отправить письмо подтверждения ещё раз.';
    if (/too many requests/i.test(text)) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
    if (/network/i.test(text)) return 'Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.';
    return text;
  };

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
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectUrl() }
    });
    if (error) return toast(message(error));
    toast('Письмо подтверждения отправлено ещё раз. Проверьте входящие и папку «Спам».', true);
  }
  window.resendConfirmation = resendConfirmation;

  async function resetPassword() {
    const input = document.getElementById('loginEmail');
    const email = normalizeEmail(input?.value);
    if (!email) return toast('Сначала введите почту РУДН.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
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
      const { data: result, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl(),
          data: { last_name: last, first_name: first, middle_name: middle, student_group: group }
        }
      });
      if (error) return toast(message(error));

      form.reset();
      if (result.session) {
        await refreshUserSafe();
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const text = String(error.message || '');
        if (/email not confirmed/i.test(text)) {
          const box = document.getElementById('loginFormNotice');
          if (box) box.innerHTML = '<button type="button" class="linkButton" onclick="resendConfirmation(document.getElementById(\'loginEmail\').value)">Отправить письмо подтверждения ещё раз</button>';
        }
        return toast(message(error));
      }
      if (!data?.session) return toast('Не удалось создать сессию. Попробуйте войти ещё раз.');
      await refreshUserSafe();
      toast('Вход выполнен. Баланс загружен.', true);
      show('wallet');
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

    // Explicitly restore the persisted session on mobile browsers after page load.
    setTimeout(() => refreshUserSafe(), 50);
  });
})();
