document.addEventListener('DOMContentLoaded',()=>{
  const u = UniPark.getCurrentUser();
  if(u){ window.location.href = u.role==='admin'?'admin.html':'dashboard.html'; return; }

  const tabs     = document.querySelectorAll('.auth-tab');
  const loginFrm = document.getElementById('form-login');
  const regFrm   = document.getElementById('form-register');
  const errEl    = document.getElementById('auth-error');

  tabs.forEach(t=>t.addEventListener('click',()=>{
    tabs.forEach(x=>x.classList.remove('active')); t.classList.add('active');
    const w = t.dataset.tab;
    loginFrm.classList.toggle('active', w==='login');
    regFrm.classList.toggle('active',   w==='register');
    hideErr();
  }));

  function showErr(m){ errEl.textContent=m; errEl.classList.remove('hidden'); }
  function hideErr(){ errEl.classList.add('hidden'); }

  // Subscription selector
  let selectedSub = 'basic';
  document.querySelectorAll('.sub-option').forEach(opt=>{
    opt.addEventListener('click',()=>{
      document.querySelectorAll('.sub-option').forEach(o=>o.classList.remove('active'));
      opt.classList.add('active');
      selectedSub = opt.dataset.sub;
    });
  });

  // Login
  document.getElementById('btn-login').addEventListener('click',()=>{
    hideErr();
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    if(!email||!pass) return showErr('Please enter your email and password.');
    const r = UniPark.login(email,pass);
    if(!r.ok) return showErr(r.error);
    window.location.href = r.user.role==='admin'?'admin.html':'dashboard.html';
  });

  document.getElementById('login-password').addEventListener('keydown',e=>{
    if(e.key==='Enter') document.getElementById('btn-login').click();
  });

  // Register
  document.getElementById('btn-register').addEventListener('click',()=>{
    hideErr();
    const name  = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass  = document.getElementById('reg-password').value;
    const plate = document.getElementById('reg-plate').value.trim();
    const role  = document.getElementById('reg-role').value;
    if(!name||!email||!pass) return showErr('Please fill in all required fields.');
    if(pass.length<6) return showErr('Password must be at least 6 characters.');
    const r = UniPark.register({name,email,password:pass,plate,role,subscription:selectedSub});
    if(!r.ok) return showErr(r.error);
    window.location.href = 'dashboard.html';
  });
});
