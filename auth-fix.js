/* RUD Coins auth recovery + profile repair. Loaded after app.js. */
(function(){
  function put(id,text,type){const e=document.getElementById(id);if(e)e.innerHTML='<div class="notice '+(type||'notice')+'">'+String(text).replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[m]))+'</div>';}
  function client(){return window.sb||null;}
  async function repairProfile(user,meta){
    const s=client(); if(!s||!user)return null;
    const q=await s.from('profiles').select('*').eq('id',user.id).maybeSingle();
    if(q.data)return q.data;
    const m=meta||user.user_metadata||{};
    const ins=await s.from('profiles').insert({id:user.id,last_name:m.last_name||'',first_name:m.first_name||'',middle_name:m.middle_name||null,student_group:m.student_group||'',rudn_email:(user.email||'').toLowerCase(),role:'student',coins:0}).select('*').maybeSingle();
    return ins.data||null;
  }
  window.loginUser=async function(ev){
    ev.preventDefault();
    const s=client(); if(!s){put('loginMsg','Сервис авторизации ещё не загрузился. Обнови страницу.','error');return;}
    const email=document.getElementById('loginEmail').value.trim().toLowerCase();
    const password=document.getElementById('loginPassword').value;
    put('loginMsg','Проверяем данные…');
    try{
      const {data,error}=await s.auth.signInWithPassword({email,password});
      if(error){
        if(/invalid login credentials/i.test(error.message||'')){
          put('loginMsg','Supabase не принял эту пару почта/пароль. Если пароль точно правильный, нажми «Восстановить пароль» ниже и задай новый пароль для этого аккаунта.','error');
        } else if(/not confirmed/i.test(error.message||'')) put('loginMsg','Сначала подтверди почту РУДН по ссылке из письма.','error');
        else put('loginMsg',error.message,'error');
        return;
      }
      if(!data.user){put('loginMsg','Аккаунт не найден.','error');return;}
      const p=await repairProfile(data.user);
      window.currentUser=data.user; window.currentProfile=p;
      if(typeof renderAuth==='function')renderAuth();
      const n=document.getElementById('adminNav');if(n)n.classList.toggle('hidden',p?.role!=='admin');
      if(typeof show==='function')show('home');
    }catch(e){console.error(e);put('loginMsg','Не удалось выполнить вход. Проверь соединение с Supabase.','error');}
  };
  window.sendPasswordReset=async function(){
    const s=client();if(!s){put('loginMsg','Сервис авторизации ещё не загрузился.','error');return;}
    const email=document.getElementById('loginEmail').value.trim().toLowerCase();
    if(!email){put('loginMsg','Сначала введи почту РУДН.','error');return;}
    try{const {error}=await s.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});if(error)throw error;put('loginMsg','Письмо для восстановления отправлено на '+email+'. Проверь почту РУДН.');}catch(e){put('loginMsg',e.message||'Не удалось отправить письмо.','error');}
  };
  function addRecovery(){
    const form=document.querySelector('#login form');if(!form||document.getElementById('resetPasswordBtn'))return;
    const b=document.createElement('button');b.type='button';b.id='resetPasswordBtn';b.className='outline';b.textContent='Восстановить пароль';b.onclick=window.sendPasswordReset;form.insertBefore(b,document.getElementById('loginMsg'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addRecovery);else addRecovery();
})();