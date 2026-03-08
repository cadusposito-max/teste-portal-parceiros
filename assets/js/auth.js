// ==========================================
// AUTENTICAÇÃO
// ==========================================

// --- Proteção contra brute-force ---
let _loginAttempts = 0;
let _loginLockout  = false;

// --- Timeout de inatividade ---
let _inactivityTimer = null;

function startInactivityWatcher() {
  const MS = SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;
  const reset = () => {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(async () => {
      showToast('Sessão encerrada por inatividade.');
      await handleLogout();
    }, MS);
  };
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(ev => {
    document.addEventListener(ev, reset, { passive: true });
  });
  reset();
}

async function checkAuth() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session && session.user) {
      state.currentUser = session.user;
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('splash-screen').classList.remove('hidden');

      startInactivityWatcher();
      initSplash();
      await fetchProducts();
      await fetchClientes();
      await fetchPropostas();
      await fetchVendas();
      renderTabs();
    } else {
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('splash-screen').classList.add('hidden');
      document.getElementById('app-content').classList.add('hidden');
    }
  } catch (error) {
    console.error('Erro auth:', error);
    const errorEl = document.getElementById('login-error');
    errorEl.innerText = 'Não foi possível conectar ao servidor. Tente novamente.';
    errorEl.classList.remove('hidden');
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (_loginLockout) return;

  const email     = document.getElementById('login-email').value.trim();
  const password  = document.getElementById('login-password').value;
  const errorEl   = document.getElementById('login-error');
  const btnSubmit = document.getElementById('btn-submit-login');

  errorEl.classList.add('hidden');
  btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> AUTENTICANDO...`;
  btnSubmit.disabled  = true;
  lucide.createIcons();

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    _loginAttempts++;
    const restantes = MAX_LOGIN_ATTEMPTS - _loginAttempts;

    if (_loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      _loginLockout = true;
      let segundos  = LOGIN_LOCKOUT_SECONDS;
      errorEl.innerText = `Muitas tentativas. Aguarde ${segundos}s para tentar novamente.`;
      errorEl.classList.remove('hidden');

      const lockInterval = setInterval(() => {
        segundos--;
        errorEl.innerText = `Muitas tentativas. Aguarde ${segundos}s para tentar novamente.`;
        btnSubmit.innerHTML = `<i data-lucide="lock" class="w-5 h-5 stroke-[3px]"></i> BLOQUEADO (${segundos}s)`;
        lucide.createIcons();
        if (segundos <= 0) {
          clearInterval(lockInterval);
          _loginLockout  = false;
          _loginAttempts = 0;
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = `<i data-lucide="log-in" class="w-5 h-5 stroke-[3px]"></i> ENTRAR NO SISTEMA`;
          errorEl.classList.add('hidden');
          lucide.createIcons();
        }
      }, 1000);
    } else {
      const aviso = restantes > 0
        ? ` (${restantes} tentativa${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''})`
        : '';
      errorEl.innerText = `E-mail ou senha incorretos.${aviso}`;
      errorEl.classList.remove('hidden');
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<i data-lucide="log-in" class="w-5 h-5 stroke-[3px]"></i> ENTRAR NO SISTEMA`;
      lucide.createIcons();
    }
  } else {
    _loginAttempts = 0;
    errorEl.classList.add('hidden');
    state.currentUser = data.user;

    await updateVendedorStats(email);
    startInactivityWatcher();

    document.getElementById('login-screen').classList.add('opacity-0');
    setTimeout(async () => {
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('splash-screen').classList.remove('hidden');
      initSplash();
      await fetchProducts();
      await fetchClientes();
      await fetchPropostas();
      await fetchVendas();
      renderHeaderUser();
      renderTabs();
    }, 500);
  }
});

// --- Recuperação de senha ---
async function handleForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  const errorEl = document.getElementById('login-error');
  const btnForgot = document.getElementById('btn-forgot-password');

  if (!email) {
    errorEl.innerText = 'Insira seu e-mail no campo acima para recuperar a senha.';
    errorEl.classList.remove('hidden');
    return;
  }

  btnForgot.innerText  = 'ENVIANDO...';
  btnForgot.disabled   = true;
  errorEl.classList.add('hidden');

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });

  btnForgot.disabled = false;
  if (error) {
    btnForgot.innerText = 'ESQUECI A SENHA';
    errorEl.innerText   = 'Erro ao enviar e-mail. Verifique o endereço e tente novamente.';
    errorEl.classList.remove('hidden');
  } else {
    btnForgot.innerText = '✓ E-MAIL ENVIADO!';
    setTimeout(() => { btnForgot.innerText = 'ESQUECI A SENHA'; }, 6000);
  }
}

async function updateVendedorStats(email) {
  let { data: stats } = await supabaseClient
    .from('vendedores_stats')
    .select('*')
    .eq('email', email)
    .single();

  if (stats) {
    await supabaseClient.from('vendedores_stats').update({
      total_logins: stats.total_logins + 1,
      ultimo_acesso: new Date().toISOString()
    }).eq('email', email);
  } else {
    await supabaseClient.from('vendedores_stats').insert([{ email: email, total_logins: 1 }]);
  }
}

async function handleLogout() {
  clearTimeout(_inactivityTimer);
  await supabaseClient.auth.signOut();
  window.location.reload();
}
