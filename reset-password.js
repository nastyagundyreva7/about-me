(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  function esc(v){return String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[m]));}
  async function setup(){
    if(!window.supabase||!window.RUD_SUPABASE_URL||!window.RUD_SUPABASE_KEY)return;
    const sb=window.supabase.createClient(window.RUD_SUPABASE_URL,window.RUD_SUPABASE_KEY);
    for(let i=0;i<40;i++){
      await wait(500);
      const box=document.getElementById('adminUsers');
      if(!box)continue;
      const {data:{session}}=await sb.auth.getSession();
      if(!session)continue;
      const {data:me}=await sb.from('profiles').select('role').eq('id',session.user.id).maybeSingle();
      if(me?.role!=='admin')continue;
      const {data:users}=await sb.from('profiles').select('id,rudn_email').neq('role','admin');
      if(!users?.length)continue;
      const byEmail=new Map(users.map(u=>[String(u.rudn_email||'').toLowerCase(),u.id]));
      box.querySelectorAll('.history').forEach(row=>{
        if(row.querySelector('.reset-password-btn'))return;
        const text=row.innerText||'';
        const email=(text.match(/[\w.+-]+@rudn\.ru/i)||[])[0]?.toLowerCase();
        const userId=email?byEmail.get(email):null;
        if(!userId)return;
        const btn=document.createElement('button');
        btn.className='outline reset-password-btn';
        btn.textContent='Сбросить пароль';
        btn.style.marginTop='8px';
        btn.onclick=async()=>{
          const p1=prompt('Новый пароль (минимум 8 символов):');
          if(p1===null)return;
          if(p1.length<8){alert('Пароль должен содержать минимум 8 символов.');return;}
          const p2=prompt('Повтори новый пароль:');
          if(p2!==p1){alert('Пароли не совпадают.');return;}
          btn.disabled=true;
          try{
            const {error}=await sb.rpc('admin_reset_student_password',{p_user_id:userId,p_new_password:p1});
            if(error)throw error;
            alert('Пароль студента успешно изменён.');
          }catch(e){alert(e?.message||String(e));}
          finally{btn.disabled=false;}
        };
        const target=row.querySelector('span');
        (target||row).appendChild(btn);
      });
    }
  }
  setup();
})();