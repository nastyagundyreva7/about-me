/* Registration fix: use the same Supabase client created by app.js. */
(function(){
  function regMsg(text,type){
    const e=document.getElementById('registerMsg');
    if(e)e.innerHTML='<div class="notice '+(type||'notice')+'">'+String(text).replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[m]))+'</div>';
  }
  window.registerStudent=async function(ev){
    ev.preventDefault();
    if(typeof sb==='undefined'||!sb){regMsg('Сервис авторизации ещё не загрузился. Обнови страницу.','error');return;}
    const f=new FormData(ev.target);
    const last=String(f.get('last')||'').trim();
    const first=String(f.get('first')||'').trim();
    const middle=String(f.get('middle')||'').trim();
    const group=String(f.get('group')||'').trim();
    const email=String(f.get('email')||'').trim().toLowerCase();
    const password=String(f.get('password')||'');
    if(!last||!first||!group||!email||!password){regMsg('Заполни все обязательные поля.','error');return;}
    if(!/@rudn\.ru$/i.test(email)){regMsg('Используй почту РУДН с доменом @rudn.ru.','error');return;}
    if(password.length<8){regMsg('Пароль должен содержать минимум 8 символов.','error');return;}
    regMsg('Создаём аккаунт…');
    try{
      const meta={last_name:last,first_name:first,middle_name:middle,student_group:group};
      const {data,error}=await sb.auth.signUp({email,password,options:{data:meta,emailRedirectTo:window.location.origin+window.location.pathname}});
      if(error)throw error;
      if(!data?.user)throw new Error('Не удалось создать аккаунт.');
      if(data.session){
        await setUser(data.user,meta);
        ev.target.reset();
        show('home');
        regMsg('Аккаунт создан. Добро пожаловать в RUD Coins!');
      }else{
        regMsg('Аккаунт создан. Теперь войди с этой почтой и паролем.');
        ev.target.reset();
      }
    }catch(e){console.error(e);regMsg(typeof friendlyError==='function'?friendlyError(e):(e.message||'Не удалось создать аккаунт.'),'error');}
  };
})();
