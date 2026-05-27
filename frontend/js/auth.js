// handles everything on the login / register page (index.html)

document.addEventListener('DOMContentLoaded', () => {

  // if the user is already logged in, skip this page entirely
  const u = UniPark.getCurrentUser();
  if (u) { window.location.href = u.role === 'admin' ? 'admin.html' : 'dashboard.html'; return; }

  // grab the two form containers and the error message box
  const tabs     = document.querySelectorAll('.auth-tab');
  const loginFrm = document.getElementById('form-login');
  const regFrm   = document.getElementById('form-register');
  const errEl    = document.getElementById('auth-error');

  // switching between the Sign in and Register tabs
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const w = t.dataset.tab;
    loginFrm.classList.toggle('active', w === 'login');
    regFrm.classList.toggle('active',   w === 'register');
    hideErr();
  }));

  // show and hide the red error banner
  function showErr(m) { errEl.textContent = m; errEl.classList.remove('hidden'); }
  function hideErr()  { errEl.classList.add('hidden'); }

  // subscription plan picker on the register form
  let selectedSub = 'basic';
  document.querySelectorAll('.sub-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.sub-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      selectedSub = opt.dataset.sub;
    });
  });

  // sign in button — checks the credentials against the backend
  document.getElementById('btn-login').addEventListener('click', () => {
    hideErr();
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    if (!email || !pass) return showErr('Please enter your email and password.');
    const r = UniPark.login(email, pass);
    if (!r.ok) return showErr(r.error);
    // admins go to the admin dashboard, everyone else goes to the main dashboard
    window.location.href = r.user.role === 'admin' ? 'admin.html' : 'dashboard.html';
  });

  // also trigger login when the user presses Enter in the password field
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });

  // create account button — validates the form and registers the user
  document.getElementById('btn-register').addEventListener('click', () => {
    hideErr();
    const name  = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass  = document.getElementById('reg-password').value;
    const plate = document.getElementById('reg-plate').value.trim();
    const role  = document.getElementById('reg-role').value;
    if (!name || !email || !pass) return showErr('Please fill in all required fields.');
    if (pass.length < 6) return showErr('Password must be at least 6 characters.');
    const r = UniPark.register({ name, email, password: pass, plate, role, subscription: selectedSub });
    if (!r.ok) return showErr(r.error);
    window.location.href = 'dashboard.html';
  });

});
