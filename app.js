const SUPABASE_URL = 'https://crpmabmarisoptxtszds.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kE-zs8xcQfX3ojxbjzepzQ_PbZEWMM6';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let events = [];
let currentUser = null;
let currentProfile = null;

const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money = n => `${Number(n || 0)} RDC`;

function toast(message, ok = false) {
  let box = document.getElementById('toast');
  if (!box) { box = document.createElement('div'); box.id = 'toast'; box.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:100;padding:14px 18px;border-radius:14px;background:#123b88;color:#fff;box-shadow:0 12px 35px #102a4a33;font-weight:700;max-width:420px'; document.body.appendChild(box); }
  box.textContent = message; box.style.background = ok ? '#16834a' : '#123b88'; clearTimeout(box._timer); box._timer = setTimeout(() => box.remove(), 4200);
}

function show(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('show'));
  document.getElementById(page)?.classList.add('show');
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  if (page === 'wallet') loadWallet();
  if (page === 'profile') loadProfile();
  if (page === 'events') renderEvents();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.show = show;

async function loadEvents() {
  try {
    const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: true });
    if (!error && data?.length) events = data;
    else events = await (await fetch('events.json', { cache: 'no-store' })).json();
  } catch (_) {
    try { events = await (await fetch('events.json', { cache: 'no-store' })).json(); } catch (_) { events = []; }
  }
  renderEvents();
}

function eventCard(e) {
  const base = Number(e.base_coins ?? e.base ?? 0);
  const date = e.event_date ? new Date(e.event_date).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : (e.date || 'Дата уточняется');
  const location = e.location || '';
  const topic = e.description || e.topic || '';
  return `<article class="event"><div class="visual"><span>🎓</span><b>+${base} RDC</b></div><div class="body"><span class="tag">${esc(e.category || 'Мероприятие')}</span><h3>${esc(e.title)}</h3><p>${esc(topic || 'Участвуй в мероприятии РУДН и получай RDC.')}</p><div class="meta">📅 ${esc(date)}${location ? `<br>📍 ${esc(location)}` : ''}</div><div class="earn"><span>Базовая награда<b>${base} RDC</b></span><span>Статус<b>Регистрация</b></span><span>Участие<b>Подтверждает админ</b></span></div><button onclick="registerForEvent(${Number(e.id)})">Зарегистрироваться</button></div></article>`;
}

function renderEvents(filter = 'Все') {
  const cats = ['Все', ...new Set(events.map(e => e.category).filter(Boolean))];
  const filters = document.getElementById('filters');
  if (filters) filters.innerHTML = cats.map(c => `<button class="filter ${c === filter ? 'on' : ''}" onclick="renderEvents('${esc(c).replace(/'/g, "\\'")}')">${esc(c)}</button>`).join('');
  const list = filter === 'Все' ? events : events.filter(e => e.category === filter);
  const html = list.map(eventCard).join('') || '<div class="empty">Мероприятий пока нет.</div>';
  document.getElementById('allEvents')?.replaceChildren();
  const all = document.getElementById('allEvents'); if (all) all.innerHTML = html;
  const home = document.getElementById('homeEvents'); if (home) home.innerHTML = events.slice(0, 3).map(eventCard).join('');
}
window.renderEvents = renderEvents;

function renderProducts() {
  const html = `<article class="product"><div class="prodimg vibes"><span>🎟️</span></div><span class="tag">Сертификат</span><h3>Сертификат в Vibes</h3><div class="pfoot"><b>100 RDC</b><button onclick="buy('Сертификат в Vibes')">Обменять</button></div></article><article class="product"><div class="prodimg shirt"><span>👕</span></div><span class="tag">Мини-мерч</span><h3>Футболка РУДН</h3><div class="pfoot"><b>200 RDC</b><button onclick="buy('Футболка РУДН')">Обменять</button></div></article><article class="product"><div class="prodimg card"><span>💳</span></div><span class="tag">Мини-мерч</span><h3>Картхолдер РУДН</h3><div class="pfoot"><b>70 RDC</b><button onclick="buy('Картхолдер РУДН')">Обменять</button></div></article><article class="product"><div class="prodimg notebook"><span>📓</span></div><span class="tag">Мини-мерч</span><h3>Блокнот РУДН</h3><div class="pfoot"><b>35 RDC</b><button onclick="buy('Блокнот РУДН')">Обменять</button></div></article>`;
  document.querySelectorAll('#products,#homeProducts').forEach(el => el.innerHTML = html);
}

async function registerStudent(event) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
  const email = String(data.get('email') || '').trim().toLowerCase();
  if (!email.endsWith('@rudn.ru')) return toast('Используй почту РУДН в формате name@rudn.ru');
  const password = String(data.get('password') || ''); if (password.length < 8) return toast('Пароль должен содержать минимум 8 символов.');
  const { data: result, error } = await supabase.auth.signUp({ email, password, options: { data: { last_name: String(data.get('last') || '').trim(), first_name: String(data.get('first') || '').trim(), middle_name: String(data.get('middle') || '').trim(), student_group: String(data.get('group') || '').trim() } } });
  if (error) return toast(error.message);
  toast(result.session ? 'Аккаунт создан. Добро пожаловать в RUD Coins!' : 'Аккаунт создан. Проверь почту РУДН и подтверди регистрацию.', true);
  form.reset(); if (result.session) await refreshUser(); show('profile');
}
window.registerStudent = registerStudent;

async function demoLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase(); const password = document.getElementById('loginPassword').value;
  if (!email || !password) return toast('Введите почту и пароль.');
  const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) return toast(error.message);
  await refreshUser(); toast('Вход выполнен.', true); show('profile');
}
window.demoLogin = demoLogin;

async function refreshUser() {
  const { data: { user } } = await supabase.auth.getUser(); currentUser = user || null; currentProfile = null;
  if (currentUser) { const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle(); currentProfile = data || null; }
  updateHeader(); if (currentUser) { loadWallet(); loadProfile(); }
}

function updateHeader() {
  const actions = document.querySelector('.actions'); if (!actions) return;
  actions.innerHTML = currentUser ? `<button class="outline" onclick="show('wallet')">${esc(currentProfile?.coins ?? 0)} RDC</button><button onclick="logout()">Выйти</button>` : '<button class="outline" onclick="show(\'login\')">Войти</button><button onclick="show(\'register\')">Регистрация</button>';
}

async function logout() { await supabase.auth.signOut(); currentUser = null; currentProfile = null; updateHeader(); toast('Вы вышли из аккаунта.', true); show('home'); }
window.logout = logout;

async function registerForEvent(eventId) {
  if (!currentUser) { toast('Сначала войдите в аккаунт.'); return show('login'); }
  const { error } = await supabase.from('event_registrations').insert({ student_id: currentUser.id, event_id: eventId, status: 'registered' });
  if (error) return toast(error.code === '23505' ? 'Вы уже зарегистрированы на это мероприятие.' : error.message);
  toast('Регистрация на мероприятие сохранена.', true); loadWallet();
}
window.registerForEvent = registerForEvent;

async function buy(title) {
  if (!currentUser) { toast('Сначала войдите в аккаунт.'); return show('login'); }
  const { data: privileges, error: pError } = await supabase.from('privileges').select('id,title,price_coins,available').eq('available', true);
  if (pError) return toast(pError.message);
  const found = privileges?.find(p => p.title === title);
  if (!found) return toast(`«${title}» ещё не заведено в таблице privileges.`);
  const { error } = await supabase.rpc('request_redemption', { p_privilege_id: found.id });
  if (error) return toast(error.message);
  toast(`Заявка на «${title}» создана. Списано ${found.price_coins} RDC.`, true); await refreshUser(); show('wallet');
}
window.buy = buy;

async function loadWallet() {
  if (!currentUser) { const b=document.getElementById('balance'); if(b)b.textContent='0 RDC'; const r=document.getElementById('myRegs'); if(r)r.innerHTML='<div class="empty">Войдите, чтобы увидеть кошелёк.</div>'; return; }
  const { data: profile } = await supabase.from('profiles').select('coins').eq('id', currentUser.id).maybeSingle();
  if (profile) { currentProfile = { ...(currentProfile || {}), ...profile }; const b=document.getElementById('balance'); if(b)b.textContent=money(profile.coins); updateHeader(); }
  const { data: regs, error } = await supabase.from('event_registrations').select('*, events(title,event_date,location,base_coins)').eq('student_id', currentUser.id).order('registered_at', { ascending: false });
  const regBox=document.getElementById('myRegs'); if(regBox)regBox.innerHTML=error?`<div class="empty">${esc(error.message)}</div>`:(regs?.map(r=>`<div class="history"><b>${esc(r.events?.title||'Мероприятие')}</b><span>${esc(r.status||'registered')}</span><small>${r.coins_awarded?'+'+r.coins_awarded+' RDC':'Ожидает подтверждения'}</small></div>`).join('')||'<div class="empty">Регистраций пока нет.</div>');
  const { data: history, error: hError } = await supabase.from('coin_transactions').select('*').eq('student_id', currentUser.id).order('created_at', { ascending: false }).limit(30);
  const hbox=document.getElementById('history'); if(hbox)hbox.innerHTML=hError?`<div class="empty">${esc(hError.message)}</div>`:(history?.map(x=>`<div class="history"><b>${esc(x.description||x.transaction_type||'Операция')}</b><span>${x.amount>0?'+':''}${x.amount} RDC</span><small>${new Date(x.created_at).toLocaleString('ru-RU')}</small></div>`).join('')||'<div class="empty">Операций пока нет.</div>');
}

async function loadProfile() {
  const box=document.getElementById('profileBox'); if(!box)return;
  if(!currentUser){box.innerHTML='<div class="profileCard"><div><h3>Вы не вошли</h3><p>Войдите или зарегистрируйтесь, чтобы открыть профиль.</p><button onclick="show(\'login\')">Войти</button></div></div>';return;}
  const p=currentProfile||{}; const name=[p.last_name,p.first_name,p.middle_name].filter(Boolean).join(' ')||currentUser.email;
  box.innerHTML=`<div class="profileCard"><div class="avatar">${esc((p.first_name||currentUser.email||'R').slice(0,1).toUpperCase())}</div><div><span class="tag">${p.role==='admin'?'Администратор':'Студент'}</span><h3>${esc(name)}</h3><p class="small">${esc(currentUser.email||'')}</p><p>Группа: <b>${esc(p.student_group||'—')}</b></p><p>Баланс: <b>${money(p.coins)}</b></p></div></div>`;
  if(p.role==='admin') await renderAdminPanel(box);
}

async function renderAdminPanel(box) {
  const { data: regs, error } = await supabase.from('event_registrations').select('id,status,coins_awarded,registered_at,student_id,events(title),profiles(first_name,last_name,rudn_email)').order('registered_at',{ascending:false}).limit(100);
  let html='<div class="section-head"><h2>Админ-панель</h2></div><div class="admin">';
  if(error)html+=`<div class="empty">Не удалось загрузить регистрации: ${esc(error.message)}</div>`;
  else if(!regs?.length)html+='<div class="empty">Регистраций пока нет.</div>';
  else html+=regs.map(r=>`<div class="history"><div><b>${esc(r.profiles?.last_name||'')} ${esc(r.profiles?.first_name||'')}</b><br><small>${esc(r.profiles?.rudn_email||'')}</small><br>${esc(r.events?.title||'')}</div><span>${esc(r.status||'registered')}</span><button onclick="confirmAttendance(${Number(r.id)})" ${r.status==='attended'?'disabled':''}>${r.status==='attended'?'Подтверждено':'Подтвердить'}</button></div>`).join('');
  html+='</div>'; box.insertAdjacentHTML('beforeend',html);
}

async function confirmAttendance(id) {
  const { data, error } = await supabase.rpc('confirm_event_attendance',{p_registration_id:id});
  if(error)return toast(error.message); toast(`Участие подтверждено. Начислено ${data} RDC.`,true); await refreshUser(); show('profile');
}
window.confirmAttendance=confirmAttendance;

supabase.auth.onAuthStateChange(() => setTimeout(refreshUser,0));

(async function init(){ renderProducts(); await loadEvents(); await refreshUser(); show('home'); })();
