/* RUD COIN authentication: completely independent from Supabase Auth.
   It talks only to our database RPC endpoints through db-client.js. */
(() => {
  const TOKEN_KEY = 'rudcoins_custom_session_v1';
  const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
  const setToken = token => token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);
  const apiRpc = async (fn, args = {}) => {
    if (typeof window.rudRpc !== 'function') throw new Error('Сервис авторизации не подключен. Обновите страницу.');
    return window.rudRpc(fn, args);
  };
  const normalize = v => String(v || '').trim().toLowerCase();
  const message = e => e?.message || String(e || 'Неизвестная ошибка');

  function applyProfile(profile) {
    currentProfile = profile || null;
    currentUser = profile ? { id: profile.id, email: profile.rudn_email || '', user_metadata: profile } : null;
    if (typeof updateHeader === 'function') updateHeader();
  }

  async function restore() {
    const token = getToken();
    if (!token) { applyProfile(null); return null; }
    try {
      const result = await apiRpc('rud_restore', { p_token: token });
      if (!result?.profile) { setToken(''); applyProfile(null); return null; }
      applyProfile(result.profile);
      await loadWallet();
      return currentUser;
    } catch (e) {
      console.error(e);
      setToken('');
      applyProfile(null);
      return null;
    }
  }

  async function loadWallet() {
    if (!currentUser) {
      const b = document.getElementById('balance'); if (b) b.textContent = '0 RDC';
      const r = document.getElementById('myRegs'); if (r) r.innerHTML = '<div class="empty">Войдите, чтобы увидеть кошелёк.</div>';
      return null;
    }
    try {
      const data = await apiRpc('rud_wallet', { p_token: getToken() });
      if (!data?.profile) throw new Error('Не удалось загрузить профиль.');
      applyProfile(data.profile);
      const b = document.getElementById('balance'); if (b) b.textContent = money(data.profile.coins || 0);
      const regBox = document.getElementById('myRegs');
      if (regBox) regBox.innerHTML = (data.registrations || []).map(r => `<div class="history"><b>${esc(r.events?.title || 'Мероприятие')}</b><span>${esc(r.status || 'registered')}</span><small>${r.coins_awarded ? '+' + r.coins_awarded + ' RDC' : 'Ожидает подтверждения'}</small></div>`).join('') || '<div class="empty">Регистраций пока нет.</div>';
      const hbox = document.getElementById('history');
      if (hbox) hbox.innerHTML = (data.history || []).map(x => `<div class="history"><b>${esc(x.description || x.transaction_type || 'Операция')}</b><span>${x.amount > 0 ? '+' : ''}${x.amount} RDC</span><small>${new Date(x.created_at).toLocaleString('ru-RU')}</small></div>`).join('') || '<div class="empty">Операций пока нет.</div>';
      return data;
    } catch (e) {
      toast(message(e));
      return null;
    }
  }

  window.loadWallet = loadWallet;
  window.refreshUser = restore;

  window.registerStudent = async function(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = normalize(data.get('email'));
    const password = String(data.get('password') || '');
    const last = String(data.get('last') || '').trim();
    const first = String(data.get('first') || '').trim();
    const middle = String(data.get('middle') || '').trim();
    const group = String(data.get('group') || '').trim();
    if (!/^[^\s@]+@rudn\.ru$/i.test(email)) return toast('Используйте почту РУДН в формате name@rudn.ru.');
    if (password.length < 8) return toast('Пароль должен содержать минимум 8 символов.');
    if (!last || !first || !group) return toast('Заполните фамилию, имя и группу.');
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.dataset.old = btn.textContent; btn.textContent = 'Создаём аккаунт…'; }
    try {
      const result = await apiRpc('rud_register', { p_email: email, p_password: password, p_last: last, p_first: first, p_middle: middle, p_group: group });
      if (!result?.token || !result?.profile) throw new Error('Сервер не вернул сессию.');
      setToken(result.token);
      applyProfile(result.profile);
      form.reset();
      toast('Аккаунт создан. Вход выполнен.', true);
      show('wallet');
      await loadWallet();
    } catch (e) { toast(message(e)); }
    finally { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.old || 'Создать аккаунт'; } }
  };

  window.demoLogin = async function(event) {
    if (event) event.preventDefault();
    const email = normalize(document.getElementById('loginEmail')?.value);
    const password = String(document.getElementById('loginPassword')?.value || '');
    if (!email || !password) return toast('Введите почту и пароль.');
    if (!/^[^\s@]+@rudn\.ru$/i.test(email)) return toast('Используйте почту РУДН в формате name@rudn.ru.');
    const btn = document.querySelector('#login form button[type="submit"]');
    if (btn) { btn.disabled = true; btn.dataset.old = btn.textContent; btn.textContent = 'Входим…'; }
    try {
      const result = await apiRpc('rud_login', { p_email: email, p_password: password });
      if (!result?.token || !result?.profile) throw new Error('Сервер не вернул сессию.');
      setToken(result.token);
      applyProfile(result.profile);
      toast('Вход выполнен. Баланс загружен.', true);
      show('wallet');
      await loadWallet();
    } catch (e) { toast(message(e)); }
    finally { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.old || 'Войти'; } }
  };

  window.logout = async function() {
    const token = getToken();
    try { if (token) await apiRpc('rud_logout', { p_token: token }); } catch (_) {}
    setToken('');
    applyProfile(null);
    toast('Вы вышли из аккаунта.', true);
    show('home');
  };

  window.registerForEvent = async function(eventId) {
    if (!currentUser) { toast('Сначала войдите в аккаунт.'); return show('login'); }
    try {
      await apiRpc('rud_register_event', { p_token: getToken(), p_event_id: Number(eventId) });
      toast('Регистрация на мероприятие сохранена.', true);
      await loadWallet();
    } catch (e) { toast(message(e)); }
  };

  window.loadProfile = async function() {
    const box = document.getElementById('profileBox'); if (!box) return;
    if (!currentUser) {
      box.innerHTML = '<div class="profileCard"><div><h3>Вы не вошли</h3><p>Войдите или зарегистрируйтесь, чтобы открыть профиль.</p><button onclick="show(\'login\')">Войти</button></div></div>';
      return;
    }
    const p = currentProfile || {};
    const name = [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ') || currentUser.email;
    box.innerHTML = `<div class="profileCard"><div class="avatar">${esc((p.first_name || currentUser.email || 'R').slice(0,1).toUpperCase())}</div><div><span class="tag">${p.role === 'admin' ? 'Администратор' : 'Студент'}</span><h3>${esc(name)}</h3><p class="small">${esc(currentUser.email || '')}</p><p>Группа: <b>${esc(p.student_group || '—')}</b></p><p>Баланс: <b>${money(p.coins)}</b></p></div></div>`;
  };

  document.addEventListener('DOMContentLoaded', () => {
    const notice = document.getElementById('loginFormNotice');
    if (notice) notice.textContent = 'Вход RUD COIN не использует Supabase Auth.';
    restore();
  });
})();
