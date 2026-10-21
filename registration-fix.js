/* Safe registration helper. Loaded after app.js. */
(function(){
  function msg(text,type){const e=document.getElementById('regMsg');if(e)e.innerHTML='<div class="notice '+(type||'notice')+'">'+String(text).replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[m]))+'</div>';}
  function client(){return window.sb||null;}
  window.registerUser=async function(ev){
    ev.preventDefault();
    const s=client();
    if(!s){msg('Сервис авторизации ещё не загрузился. Обнови страницу.','error');return;}
    const last=document.getElementById('regLast').value.trim();
    const first=document.getElementById('regFirst').value.trim();
    const middle=document.getElementById('regMiddle').value.trim();
    const group=document.getElementById('regGroup').value.trim();
    const email=document.getElementById('regEmail').value.trim().toLowerCase();
    const password=document.getElementById('regPassword').value;
    if(!last||!first||!group||!email||!password){msg('Заполни все обязательные поля.','error');return;}
    if(!/@rudn\.ru$/i.test(email)){msg('Используй почту РУДН в формате @rudn.ru.','error');return;}
    if(password.length<8){msg('Пароль должен содержать минимум 8 символов.','error');return;}
    msg('Создаём аккаунт…');
    try{
      const {data,error}=await s.auth.signUp({email,password,options:{data:{last_name:last,first_name:first,middle_name:middle,student_group:group,rudn_email:email}}});
      if(error)throw error;
      if(!data.user)throw new Error('Не удалось создать аккаунт.');
      const {error:profileError}=await s.from('profiles').upsert({id:data.user.id,last_name:last,first_name:first,middle_name:middle||null,student_group:group,rudn_email:email,role:'student',coins:0},{onConflict:'id'});
      if(profileError)throw profileError;
      if(data.session){
        window.currentUser=data.user;
        const p=await s.from('profiles').select('*').eq('id',data.user.id).maybeSingle();
        window.currentProfile=p.data||null;
        if(typeof renderAuth==='function')renderAuth();
        if(typeof show==='function')show('home');
        msg('Аккаунт создан. Добро пожаловать!');
      }else{
        msg('Аккаунт создан. Теперь войди с этой почтой и паролем.');
      }
    }catch(e){console.error(e);msg(e.message||'Не удалось создать аккаунт.','error');}
  };
})();
