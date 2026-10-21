function adminRpc(fn, body={}){ return rudRpc(fn,body); }
function adminEsc(v=''){ return esc(v); }

function isAdmin(){ return !!(currentUser && currentProfile && currentProfile.role==='admin'); }

function syncAdminNav(){
  const n=document.getElementById('adminNav');
  if(n) n.style.display=isAdmin()?'':'none';
}

function ensureAdminEntry(){
  const box=document.getElementById('profileBox');
  if(!box || !isAdmin()) return;
  if(document.getElementById('profileAdminEntry')) return;
  const entry=document.createElement('div');
  entry.id='profileAdminEntry';
  entry.className='admin';
  entry.style.marginTop='18px';
  entry.innerHTML='<div class="section-head" style="margin-top:0"><div><div class="eyebrow">ДОСТУП АДМИНИСТРАТОРА</div><h2>Админ-панель</h2><p class="small">Управление пользователями, мероприятиями и подтверждением участия.</p></div><button type="button" onclick="show(\'admin\')">Открыть админ-панель</button></div>';
  box.appendChild(entry);
}

async function loadAdmin(){
  syncAdminNav();
  const page=document.getElementById('admin');
  if(!page) return;
  if(!isAdmin()){
    show('profile');
    toast('Доступ к админ-панели разрешён только администраторам.');
    return;
  }
  const stats=document.getElementById('adminStats');
  const users=document.getElementById('adminUsers');
  const regs=document.getElementById('adminRegs');
  if(stats) stats.innerHTML='<div class="step"><b>Загрузка…</b></div>';
  if(users) users.innerHTML='<div class="empty">Загрузка…</div>';
  if(regs) regs.innerHTML='<div class="empty">Загрузка…</div>';
  try{
    const [s,u,r]=await Promise.all([
      adminRpc('rud_admin_stats',{p_token:sessionToken()}),
      adminRpc('rud_admin_users',{p_token:sessionToken()}),
      adminRpc('rud_admin_registrations',{p_token:sessionToken()})
    ]);
    if(stats) stats.innerHTML=`<div class="step"><span class="num">${Number(s?.users||0)}</span><b>Студентов</b></div><div class="step"><span class="num">${Number(s?.events||0)}</span><b>Мероприятий</b></div><div class="step"><span class="num">${Number(s?.registrations||0)}</span><b>Регистраций</b></div><div class="step"><span class="num">${Number(s?.coins||0)}</span><b>RDC в системе</b></div>`;
    if(users) users.innerHTML=(u||[]).map(x=>`<div class="history"><div><b>${adminEsc([x.last_name,x.first_name,x.middle_name].filter(Boolean).join(' ')||'Без имени')}</b><small>${adminEsc(x.rudn_email||'')} · ${adminEsc(x.student_group||'—')}</small></div><span>${Number(x.coins||0)} RDC</span><small>${adminEsc(x.role||'student')}</small></div>`).join('')||'<div class="empty">Пользователей нет.</div>';
    if(regs) regs.innerHTML=(r||[]).map(x=>`<div class="history"><div><b>${adminEsc(x.event?.title||'Мероприятие')}</b><small>${adminEsc(x.student?.name||'')} · ${adminEsc(x.student?.email||'')}</small></div><span>${adminEsc(x.status||'registered')}</span><button type="button" onclick="adminConfirm(${Number(x.id)})">Подтвердить</button></div>`).join('')||'<div class="empty">Регистраций нет.</div>';
  }catch(e){
    const message=e?.message||'Не удалось загрузить админ-панель.';
    if(stats) stats.innerHTML=`<div class="notice error">${adminEsc(message)}</div>`;
    if(users) users.innerHTML='<div class="empty">Не удалось загрузить пользователей.</div>';
    if(regs) regs.innerHTML='<div class="empty">Не удалось загрузить регистрации.</div>';
  }
}
window.loadAdmin=loadAdmin;

async function createEvent(ev){
  ev.preventDefault();
  if(!isAdmin()) return toast('Доступ запрещён.');
  const f=new FormData(ev.target);
  try{
    await adminRpc('rud_admin_create_event',{p_token:sessionToken(),p_title:String(f.get('title')||''),p_date:String(f.get('date')||''),p_category:String(f.get('category')||''),p_level:String(f.get('level')||''),p_coins:Number(f.get('coins')||0),p_location:String(f.get('location')||''),p_description:String(f.get('description')||'')});
    ev.target.reset();
    toast('Мероприятие добавлено.',true);
    await loadEvents();
    await loadAdmin();
  }catch(e){ toast(e?.message||'Не удалось добавить мероприятие.'); }
}
window.createEvent=createEvent;

async function adminConfirm(id){
  if(!isAdmin()) return toast('Доступ запрещён.');
  try{
    const result=await adminRpc('rud_admin_confirm_attendance',{p_token:sessionToken(),p_registration_id:Number(id)});
    toast(`Участие подтверждено. Начислено ${result||0} RDC.`,true);
    await loadAdmin();
  }catch(e){ toast(e?.message||'Не удалось подтвердить участие.'); }
}
window.adminConfirm=adminConfirm;

const originalShow=window.show;
window.show=function(page){
  originalShow(page);
  if(page==='profile') setTimeout(ensureAdminEntry,0);
  if(page==='admin') setTimeout(loadAdmin,0);
};

syncAdminNav();
setInterval(()=>{ syncAdminNav(); ensureAdminEntry(); },1000);
