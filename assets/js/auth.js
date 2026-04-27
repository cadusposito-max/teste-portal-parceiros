// ==========================================
// AUTENTICAÇÃO
// ==========================================

// --- Proteção contra brute-force (persiste no sessionStorage para resistir a F5) ---
const _BF_KEY_ATTEMPTS = 'bf_attempts';
const _BF_KEY_UNTIL    = 'bf_until';
const _RECOVERY_KEY_UNTIL = 'recovery_until';
const RECOVERY_COOLDOWN_SECONDS = 45;

function _bfGetAttempts() { return parseInt(sessionStorage.getItem(_BF_KEY_ATTEMPTS) || '0', 10); }
function _bfSetAttempts(n) { sessionStorage.setItem(_BF_KEY_ATTEMPTS, String(n)); }
function _bfGetUntil()    { return parseInt(sessionStorage.getItem(_BF_KEY_UNTIL) || '0', 10); }
function _bfSetUntil(ts)  { sessionStorage.setItem(_BF_KEY_UNTIL, String(ts)); }
function _bfClear()       { sessionStorage.removeItem(_BF_KEY_ATTEMPTS); sessionStorage.removeItem(_BF_KEY_UNTIL); }
function _recoveryGetUntil() { return parseInt(sessionStorage.getItem(_RECOVERY_KEY_UNTIL) || '0', 10); }
function _recoverySetUntil(ts) { sessionStorage.setItem(_RECOVERY_KEY_UNTIL, String(ts)); }

let _loginLockout = false;

// --- Flag para fluxo de recuperação de senha ---
let _isPasswordRecovery = false;

let _mfaFactorId = null;
let _mfaChallengeId = null;
let _pendingUser = null;
let _pendingEmail = null;
let _adminMfaEnrollId = null;

// --- Cloudflare Turnstile: token capturado pelo widget, validado pelo Supabase no backend ---
let _captchaToken = null;

function onTurnstileSuccess(token) {
  _captchaToken = token;
}

function onTurnstileExpiry() {
  _captchaToken = null;
}

function onTurnstileError() {
  _captchaToken = null;
  const errorEl  = document.getElementById('login-error');
  const btnSubmit = document.getElementById('btn-submit-login');
  if (errorEl) {
    errorEl.innerText = 'Falha na verificação de segurança. Recarregue a página e tente novamente.';
    errorEl.classList.remove('hidden');
  }
  // Desabilita o botão até o usuário recarregar — impede envio sem captchaToken
  if (btnSubmit) btnSubmit.disabled = true;
}

// --- Timeout de inatividade ---
let _inactivityTimer = null;
let _authSessionRevalidationInFlight = false;
let _inactivityWatcherBound = false;
let _authSkipNextSignedOutUi = false;
let _authSkipNextSignedOutUiTimer = null;

let _authLucideCreateIconsRaf = null;

function queueAuthLucideCreateIcons() {
  if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
  if (_authLucideCreateIconsRaf) return;

  _authLucideCreateIconsRaf = window.requestAnimationFrame(() => {
    _authLucideCreateIconsRaf = null;
    window.lucide.createIcons();
  });
}

function _authSetButtonWithIcon(btn, iconName, label, iconClass = 'w-5 h-5 stroke-[3px]') {
  if (!btn) return;
  btn.innerHTML = `<i data-lucide="${iconName}" class="${iconClass}"></i> <span data-auth-btn-label>${label}</span>`;
  queueAuthLucideCreateIcons();
}

function _authUpdateButtonLabel(btn, label) {
  if (!btn) return false;
  const labelEl = btn.querySelector('[data-auth-btn-label]');
  if (!labelEl) return false;
  labelEl.textContent = label;
  return true;
}


let _activeCheckFailureReason = null;

function _authSyncSessionIdentity(session) {
  if (typeof applySessionIdentity === 'function') {
    applySessionIdentity(session);
    return;
  }

  const user = session?.user || null;
  const appMeta = user?.app_metadata || {};
  state.currentUser = user;
  state.isAdmin = appMeta.role === 'admin';
  state.isGestor = appMeta.role === 'gestor';
  state.franquiaId = appMeta.franquia_id || null;
  state.currentAal = typeof decodeSessionJwtClaims === 'function'
    ? (decodeSessionJwtClaims(session)?.aal || null)
    : null;
}

function _authShowLoginScreen(message = '') {
  const loginScreen = document.getElementById('login-screen');
  const splashScreen = document.getElementById('splash-screen');
  const appContent = document.getElementById('app-content');
  const loginForm = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

  if (loginScreen) {
    loginScreen.classList.remove('hidden', 'opacity-0');
  }
  if (splashScreen) {
    splashScreen.classList.add('hidden', 'opacity-0', 'pointer-events-none');
  }
  if (appContent) {
    appContent.classList.add('hidden', 'opacity-0', 'scale-95');
  }
  if (loginForm) loginForm.classList.remove('hidden');

  if (message && errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }

  if (typeof window.turnstile !== 'undefined') window.turnstile.reset();
  queueAuthLucideCreateIcons();
}

async function _authForceReturnToLogin(message = '') {
  clearTimeout(_inactivityTimer);
  _mfaFactorId = null;
  _mfaChallengeId = null;
  _pendingUser = null;
  _pendingEmail = null;
  _adminMfaEnrollId = null;

  _authSkipNextSignedOutUi = true;
  clearTimeout(_authSkipNextSignedOutUiTimer);
  _authSkipNextSignedOutUiTimer = setTimeout(() => {
    _authSkipNextSignedOutUi = false;
    _authSkipNextSignedOutUiTimer = null;
  }, 2000);
  await supabaseClient.auth.signOut().catch(() => {});
  if (typeof resetUser === 'function') resetUser();
  if (typeof clearSessionState === 'function') clearSessionState();
  if (typeof chatTeardown === 'function') chatTeardown(true);
  _authShowLoginScreen(message);
}

async function _authRevalidateSession(event, session) {
  if (_authSessionRevalidationInFlight || _isPasswordRecovery) return;
  if (!session?.user) return;
  if (event !== 'TOKEN_REFRESHED' && event !== 'USER_UPDATED') return;

  _authSessionRevalidationInFlight = true;
  try {
    _authSyncSessionIdentity(session);

    const isActive = await ensureUserIsActive();
    if (!isActive) {
      await blockInactiveSession();
      return;
    }

    if (!state.isAdmin) return;

    const status = await _checkAdminMfaStatus();
    if (status === 'ok') return;

    await _authForceReturnToLogin('Sessao administrativa invalida. Faca login novamente com MFA.');
  } finally {
    _authSessionRevalidationInFlight = false;
  }
}

async function ensureUserIsActive() {
  _activeCheckFailureReason = null;

  try {
    const { data, error } = await supabaseClient.rpc('is_current_user_active');

    if (error) {
      _activeCheckFailureReason = 'rpc_error';
      return false;
    }

    const isActive = data !== false;
    if (!isActive) _activeCheckFailureReason = 'inactive';
    return isActive;
  } catch (_) {
    _activeCheckFailureReason = 'rpc_error';
    return false;
  }
}

function _getInactiveSessionMessage(reason) {
  if (reason === 'rpc_error') {
    return 'Nao foi possivel validar o status da conta. Tente novamente.';
  }
  return 'Usuario desativado. Contate o administrador.';
}

async function blockInactiveSession(reason = _activeCheckFailureReason || 'inactive') {
  await _authForceReturnToLogin(_getInactiveSessionMessage(reason));
}

// Detecta eventos de sessão sensíveis.
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    _isPasswordRecovery = true;
    showPasswordResetForm();
    return;
  }

  if (event === 'SIGNED_OUT') {
    if (_authSkipNextSignedOutUi) {
      _authSkipNextSignedOutUi = false;
      clearTimeout(_authSkipNextSignedOutUiTimer);
      _authSkipNextSignedOutUiTimer = null;
      return;
    }

    clearTimeout(_inactivityTimer);
    if (typeof resetUser === 'function') resetUser();
    if (typeof clearSessionState === 'function') clearSessionState();
    _authShowLoginScreen();
    return;
  }

  await _authRevalidateSession(event, session);
});
function startInactivityWatcher() {
  const MS = SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;
  const reset = () => {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(async () => {
      showToast('Sessão encerrada por inatividade.');
      await handleLogout();
    }, MS);
  };
  if (!_inactivityWatcherBound) {
    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(ev => {
      document.addEventListener(ev, reset, { passive: true });
    });
    _inactivityWatcherBound = true;
  }
  reset();
}

async function checkAuth() {
  try {
    // Detecta link de recuperação de senha (fluxo implícito via hash da URL)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('type') === 'recovery') {
      await supabaseClient.auth.getSession(); // troca o token de recuperação
      _isPasswordRecovery = true;
      showPasswordResetForm();
      return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    // Guard: onAuthStateChange pode ter detectado PASSWORD_RECOVERY (PKCE)
    if (_isPasswordRecovery) return;

    if (session && session.user) {
      _authSyncSessionIdentity(session);
      const isActive = await ensureUserIsActive();
      if (!isActive) {
        await blockInactiveSession();
        return;
      }

      // === ENFORCEMENT MFA PARA ADMINS (page reload) ===
      if (state.isAdmin) {
        const intercepted = await _enforceAdminMfa(session.user, session.user.email);
        if (intercepted) return;
      }
      // === FIM ENFORCEMENT MFA ===

      if (state.isAdmin || state.isGestor) {
        const adminBtn = document.getElementById('admin-toggle-btn');
        if (adminBtn) adminBtn.classList.remove('hidden');
      }
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('splash-screen').classList.remove('hidden');

      startInactivityWatcher();
      await Promise.all([
        initSplash(),
        fetchFranquia(),
        fetchFranquiasCatalog(),
        fetchProfile(),
        fetchProducts(),
        fetchClientes(),
        fetchPropostas(),
        fetchVendas(),
        fetchComponentes(),
        fetchComunicados(),
        updateVendedorStats(session.user.email),
      ]);
      renderHeaderUser();
      renderTabs();
      renderContent();
      if (typeof chatBoot === 'function') await chatBoot();
      if (typeof identifyUser === 'function') identifyUser(session.user);
    } else {
      if (typeof clearSessionState === 'function') clearSessionState();
      if (typeof resetUser === 'function') resetUser();
      _authShowLoginScreen();
    }
  } catch (error) {
    console.error('Erro auth:', error);
    if (typeof clearSessionState === 'function') clearSessionState();
    _authShowLoginScreen();
    const errorEl = document.getElementById('login-error');
    errorEl.innerText = 'Não foi possível conectar ao servidor. Tente novamente.';
    errorEl.classList.remove('hidden');
  }
}

// Ao carregar a página, verifica se ainda há lockout ativo
(function _bfCheckOnLoad() {
  const until = _bfGetUntil();
  if (until && Date.now() < until) {
    _loginLockout = true;
    const btnSubmit = document.getElementById('btn-submit-login');
    const errorEl   = document.getElementById('login-error');
    let segundos = Math.ceil((until - Date.now()) / 1000);
    if (errorEl) { errorEl.innerText = `Muitas tentativas. Aguarde ${segundos}s.`; errorEl.classList.remove('hidden'); }
    if (btnSubmit) {
      btnSubmit.disabled = true;
      _authSetButtonWithIcon(btnSubmit, 'lock', `BLOQUEADO (${segundos}s)`);
    }
    const iv = setInterval(() => {
      segundos--;
      if (errorEl) errorEl.innerText = `Muitas tentativas. Aguarde ${segundos}s.`;
      if (btnSubmit && !_authUpdateButtonLabel(btnSubmit, `BLOQUEADO (${segundos}s)`)) {
        _authSetButtonWithIcon(btnSubmit, 'lock', `BLOQUEADO (${segundos}s)`);
      }
      if (segundos <= 0) {
        clearInterval(iv);
        _loginLockout = false;
        _bfClear();
        if (btnSubmit) {
          btnSubmit.disabled = false;
          _authSetButtonWithIcon(btnSubmit, 'log-in', 'ENTRAR NO SISTEMA');
        }
        if (errorEl) errorEl.classList.add('hidden');
      }
    }, 1000);
  }
})();

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (_loginLockout) return;

  const email     = document.getElementById('login-email').value.trim();
  const password  = document.getElementById('login-password').value;
  const errorEl   = document.getElementById('login-error');
  const btnSubmit = document.getElementById('btn-submit-login');

  // Limpa estilos inline que possam ter sido definidos pelo fluxo de reset de senha
  errorEl.style.color       = '';
  errorEl.style.borderColor = '';
  errorEl.style.background  = '';

  // Bloqueia envio sem token Turnstile — o Supabase valida no backend
  if (!_captchaToken) {
    errorEl.innerText = 'Por favor, conclua a verificação de segurança antes de entrar.';
    errorEl.classList.remove('hidden');
    return;
  }

  errorEl.classList.add('hidden');
  btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> AUTENTICANDO...`;
  btnSubmit.disabled  = true;
  queueAuthLucideCreateIcons();

  // Consume o token imediatamente — é single-use; Turnstile gerará novo após reset
  const captchaToken = _captchaToken;
  _captchaToken = null;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });

  if (error) {
    if (typeof captureEvent === 'function') {
      captureEvent('login_failed', { source: 'portal' });
    }

    // Token consumido — força novo desafio Turnstile antes da próxima tentativa
    if (typeof window.turnstile !== 'undefined') window.turnstile.reset();

    const attempts = _bfGetAttempts() + 1;
    _bfSetAttempts(attempts);
    const restantes = MAX_LOGIN_ATTEMPTS - attempts;

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      _loginLockout = true;
      const until = Date.now() + LOGIN_LOCKOUT_SECONDS * 1000;
      _bfSetUntil(until);
      let segundos = LOGIN_LOCKOUT_SECONDS;
      errorEl.innerText = `Muitas tentativas. Aguarde ${segundos}s para tentar novamente.`;
      errorEl.classList.remove('hidden');

      _authSetButtonWithIcon(btnSubmit, 'lock', `BLOQUEADO (${segundos}s)`);

      const lockInterval = setInterval(() => {
        segundos--;
        errorEl.innerText = `Muitas tentativas. Aguarde ${segundos}s para tentar novamente.`;
        if (!_authUpdateButtonLabel(btnSubmit, `BLOQUEADO (${segundos}s)`)) {
          _authSetButtonWithIcon(btnSubmit, 'lock', `BLOQUEADO (${segundos}s)`);
        }
        if (segundos <= 0) {
          clearInterval(lockInterval);
          _loginLockout = false;
          _bfClear();
          btnSubmit.disabled = false;
          _authSetButtonWithIcon(btnSubmit, 'log-in', 'ENTRAR NO SISTEMA');
          errorEl.classList.add('hidden');
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
      queueAuthLucideCreateIcons();
    }
  } else {
    _bfClear();
    errorEl.classList.add('hidden');
    _authSyncSessionIdentity(data.session || { user: data.user });

    if (state.isAdmin) {
      const [{ data: mfaData, error: mfaError }, { data: aalData, error: aalError }] = await Promise.all([
        supabaseClient.auth.mfa.listFactors(),
        supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);

      if (mfaError || aalError) {
        const message = 'Nao foi possivel validar a sessao MFA administrativa. Faca login novamente.';
        await _authForceReturnToLogin(message);
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i data-lucide="log-in" class="w-5 h-5 stroke-[3px]"></i> ENTRAR NO SISTEMA`;
        queueAuthLucideCreateIcons();
        return;
      }

      const verifiedFactor = mfaData?.totp?.find((factor) => factor.status === 'verified') || null;
      const needsMfa = Boolean(
        verifiedFactor
        && aalData?.currentLevel === 'aal1'
        && aalData?.nextLevel === 'aal2'
      );

      if (needsMfa) {
        const { data: challengeData, error: chErr } = await supabaseClient.auth.mfa.challenge({
          factorId: verifiedFactor.id,
        });

        if (chErr) {
          await _authForceReturnToLogin('Erro ao iniciar verificacao MFA administrativa. Faca login novamente.');
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = `<i data-lucide="log-in" class="w-5 h-5 stroke-[3px]"></i> ENTRAR NO SISTEMA`;
          queueAuthLucideCreateIcons();
          return;
        }

        _mfaFactorId = verifiedFactor.id;
        _mfaChallengeId = challengeData.id;
        _pendingUser = data.user;
        _pendingEmail = email;
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('mfa-step').classList.remove('hidden');
        document.getElementById('mfa-login-code').focus();
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i data-lucide="log-in" class="w-5 h-5 stroke-[3px]"></i> ENTRAR NO SISTEMA`;
        queueAuthLucideCreateIcons();
        return;
      }
    }

    await _finishLogin(data.user, email);
  }
});

// ==========================================
// MFA OBRIGATÓRIO PARA ADMIN
// ==========================================

/**
 * Verifica se o admin precisa de ação MFA antes de acessar o sistema.
 * Retorna: 'ok' | 'setup_required' | 'challenge_required' | 'api_error'
 * Só é chamada quando state.isAdmin === true.
 *
 * POLÍTICA DE SEGURANÇA (fail-closed):
 * Qualquer falha na API — erro retornado OU exceção — devolve 'api_error'.
 * O acesso admin é SEMPRE bloqueado até confirmação positiva explícita de aal2.
 * 'ok' só é retornado quando aalData.currentLevel === 'aal2' com certeza.
 */
async function _checkAdminMfaStatus() {
  try {
    const [
      { data: aalData, error: aalError },
      { data: mfaData, error: mfaError },
    ] = await Promise.all([
      supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabaseClient.auth.mfa.listFactors(),
    ]);

    // Qualquer erro retornado pela API é tratado como bloqueante
    if (aalError) {
      console.error('[_checkAdminMfaStatus] Erro em getAuthenticatorAssuranceLevel:', aalError);
      return 'api_error';
    }
    if (mfaError) {
      console.error('[_checkAdminMfaStatus] Erro em listFactors:', mfaError);
      return 'api_error';
    }

    // Confirmação positiva explícita de aal2.
    // Nunca assume por ausência de valor — se currentLevel não for exatamente 'aal2', bloqueia.
    if (aalData?.currentLevel === 'aal2') {
      state.currentAal = 'aal2';
      return 'ok';
    }

    const hasVerifiedTotp = Boolean(mfaData?.totp?.some(f => f.status === 'verified'));
    return hasVerifiedTotp ? 'challenge_required' : 'setup_required';
  } catch (err) {
    // Exceção de rede, timeout ou SDK — bloqueia acesso, nunca libera
    console.error('[_checkAdminMfaStatus] Exceção ao verificar MFA do admin. Bloqueando acesso (fail-closed).', err);
    return 'api_error';
  }
}

/**
 * Ponto de entrada do enforcement MFA. Decide entre setup, challenge ou erro bloqueante.
 * Retorna true se interceptou o fluxo (app NÃO deve carregar).
 *
 * Invariante: só retorna false quando _checkAdminMfaStatus() confirmar 'ok' explicitamente.
 * Qualquer outro resultado — incluindo falha de API — intercepta e bloqueia.
 */
async function _enforceAdminMfa(user, email) {
  const status = await _checkAdminMfaStatus();

  // Único caminho para false: API confirmou aal2 com certeza
  if (status === 'ok') return false;

  _pendingUser  = user;
  _pendingEmail = email;

  if (status === 'setup_required') {
    console.warn('[AdminMFA] Admin sem MFA configurado. Forçando setup. user_id:', user?.id);
    await _startAdminMfaSetup();
    return true;
  }

  if (status === 'challenge_required') {
    console.warn('[AdminMFA] Admin com sessão aal1. Forçando challenge. user_id:', user?.id);
    await _startAdminPostAuthChallenge();
    return true;
  }

  if (status === 'api_error') {
    console.error('[AdminMFA] API de MFA indisponível. Acesso bloqueado por segurança. user_id:', user?.id);
    await _authForceReturnToLogin(
      'Não foi possível verificar o status de autenticação MFA. ' +
      'Por segurança, o acesso foi bloqueado. Verifique sua conexão e tente novamente.'
    );
    return true;
  }

  // Status desconhecido (defensivo) — bloqueia por padrão, nunca libera
  console.error('[AdminMFA] Status MFA desconhecido:', status, '— bloqueando acesso. user_id:', user?.id);
  await _authForceReturnToLogin('Erro interno de autenticação MFA. Faca login novamente.');
  return true;
}

/**
 * Exibe a tela de erro bloqueante (#mfa-api-error) com a mensagem indicada.
 * Oculta todos os outros estados do card de login.
 */
function _showAdminMfaApiError(message) {
  _authShowLoginScreen(message);
}

/**
 * Tenta novamente a verificação MFA após erro de API.
 * Chamada pelo botão 'TENTAR NOVAMENTE' em #mfa-api-error.
 *
 * Fluxo de loop seguro:
 *   - Se a API ainda falhar → _enforceAdminMfa retorna true → _showAdminMfaApiError exibe erro novamente.
 *   - Não há retry automático — só ocorre por ação explícita do usuário.
 *   - Se _pendingUser for null (estado perdido) → força signOut + volta para login.
 */
async function retryAdminMfaCheck() {
  await _authForceReturnToLogin();
}

/**
 * Cancela a sessão após erro de API MFA e volta para a tela de login limpa.
 * Chamada pelo botão 'SAIR E FAZER LOGIN NOVAMENTE' em #mfa-api-error.
 */
async function cancelAdminMfaError() {
  await _authForceReturnToLogin();
}

/**
 * Inicia registro de TOTP para admin que ainda não tem MFA.
 * Mostra QR code na tela de setup.
 */
async function _startAdminMfaSetup() {
  const setupScreen = document.getElementById('mfa-setup-admin');
  const qrContainer = document.getElementById('mfa-setup-qr');
  const errEl       = document.getElementById('mfa-setup-error');
  const btn         = document.getElementById('btn-mfa-setup-confirm');

  if (errEl) errEl.classList.add('hidden');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline-block mr-1"></i> CONFIGURANDO...'; queueAuthLucideCreateIcons(); }

  const { data, error } = await supabaseClient.auth.mfa.enroll({ factorType: 'totp' });

  if (error) {
    console.error('[AdminMFA] Erro ao iniciar enrollment TOTP:', error);
    await _authForceReturnToLogin('Erro ao iniciar configuracao MFA administrativa. Faca login novamente.');
    return;
  }

  _adminMfaEnrollId = data.id;

  if (qrContainer) {
    qrContainer.innerHTML = `
      <img src="${data.totp.qr_code}" alt="QR Code MFA" class="w-48 h-48 mx-auto border-4 border-white bg-white">
      <p class="text-neutral-600 text-[9px] font-bold mt-3 text-center font-mono break-all px-2">
        Chave manual: ${data.totp.secret}
      </p>`;
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="shield-check" class="w-5 h-5 stroke-[3px]"></i> <span>ATIVAR AUTENTICADOR</span>'; queueAuthLucideCreateIcons(); }

  // Garante que apenas a tela de setup está visível dentro do card de login
  document.getElementById('login-form').classList.add('hidden');
  const mfaStepEl = document.getElementById('mfa-step');
  if (mfaStepEl) mfaStepEl.classList.add('hidden');
  if (setupScreen) setupScreen.classList.remove('hidden');

  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('splash-screen').classList.add('hidden');
  document.getElementById('app-content').classList.add('hidden');

  queueAuthLucideCreateIcons();
  const codeInput = document.getElementById('mfa-setup-code');
  if (codeInput) { codeInput.value = ''; codeInput.focus(); }
}

/**
 * Confirma o código TOTP do enrollment e eleva sessão para aal2.
 * Chamada pelo botão "ATIVAR AUTENTICADOR" no HTML.
 */
async function confirmAdminMfaSetup() {
  const code  = (document.getElementById('mfa-setup-code')?.value || '').trim();
  const errEl = document.getElementById('mfa-setup-error');
  const btn   = document.getElementById('btn-mfa-setup-confirm');

  if (errEl) errEl.classList.add('hidden');

  if (code.length !== 6) {
    if (errEl) { errEl.innerText = 'Insira o código de 6 dígitos do seu app autenticador.'; errEl.classList.remove('hidden'); }
    return;
  }

  if (!_adminMfaEnrollId) {
    if (errEl) { errEl.innerText = 'Sessão de configuração expirou. Cancele e faça login novamente.'; errEl.classList.remove('hidden'); }
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline-block mr-1"></i> VERIFICANDO...'; queueAuthLucideCreateIcons(); }

  const { data: challengeData, error: chErr } = await supabaseClient.auth.mfa.challenge({ factorId: _adminMfaEnrollId });
  if (chErr) {
    console.error('[AdminMFA] Erro no challenge do enrollment:', chErr);
    await _authForceReturnToLogin('Erro ao validar a configuracao MFA administrativa. Faca login novamente.');
    return;
  }

  const { error: verifyErr } = await supabaseClient.auth.mfa.verify({
    factorId:    _adminMfaEnrollId,
    challengeId: challengeData.id,
    code,
  });

  if (verifyErr) {
    console.warn('[AdminMFA] Código TOTP inválido no setup. user_id:', _pendingUser?.id);
    if (errEl) { errEl.innerText = 'Código inválido. Verifique o app autenticador e tente novamente.'; errEl.classList.remove('hidden'); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="shield-check" class="w-5 h-5 stroke-[3px]"></i> <span>ATIVAR AUTENTICADOR</span>'; queueAuthLucideCreateIcons(); }
    return;
  }

  // Enrollment concluído — sessão agora é aal2
  console.info('[AdminMFA] MFA TOTP configurado com sucesso. user_id:', _pendingUser?.id);
  state.currentAal = 'aal2';
  _adminMfaEnrollId = null;

  const setupScreen = document.getElementById('mfa-setup-admin');
  if (setupScreen) setupScreen.classList.add('hidden');

  const user  = _pendingUser;
  const email = _pendingEmail;
  _pendingUser  = null;
  _pendingEmail = null;

  await _finishLogin(user, email);
}

/**
 * Cancela o setup MFA: desfaz o enrollment e desloga o admin.
 * Chamada pelo botão "CANCELAR E SAIR".
 */
async function cancelAdminMfaSetup() {
  if (_adminMfaEnrollId) {
    await supabaseClient.auth.mfa.unenroll({ factorId: _adminMfaEnrollId }).catch(() => {});
    _adminMfaEnrollId = null;
  }
  await _authForceReturnToLogin();
}

/**
 * Challenge pós-autenticação: admin já tem TOTP mas sessão está em aal1.
 * Reutiliza a tela #mfa-step do login, mas disparada após checkAuth.
 */
async function _startAdminPostAuthChallenge() {
  const { data: mfaData, error: mfaError } = await supabaseClient.auth.mfa.listFactors();
  if (mfaError) {
    console.error('[AdminMFA] Erro ao listar factors no challenge pos-auth:', mfaError);
    await _authForceReturnToLogin('Nao foi possivel validar o MFA administrativo. Faca login novamente.');
    return;
  }

  const factor = mfaData?.totp?.find(f => f.status === 'verified');

  if (!factor) {
    // Fallback defensivo: não achou factor verificado → forçar setup
    await _startAdminMfaSetup();
    return;
  }

  const { data: challengeData, error: chErr } = await supabaseClient.auth.mfa.challenge({ factorId: factor.id });
  if (chErr) {
    console.error('[AdminMFA] Erro ao iniciar challenge pós-auth:', chErr);
    await _authForceReturnToLogin('Erro ao iniciar verificacao MFA administrativa. Faca login novamente.');
    return;
  }

  _mfaFactorId    = factor.id;
  _mfaChallengeId = challengeData.id;
  // _pendingUser e _pendingEmail já foram setados pelo caller (_enforceAdminMfa)

  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('splash-screen').classList.add('hidden');
  document.getElementById('app-content').classList.add('hidden');
  document.getElementById('login-form').classList.add('hidden');
  const setupScreen = document.getElementById('mfa-setup-admin');
  if (setupScreen) setupScreen.classList.add('hidden');

  const mfaStep = document.getElementById('mfa-step');
  if (mfaStep) mfaStep.classList.remove('hidden');
  const codeInput = document.getElementById('mfa-login-code');
  if (codeInput) { codeInput.value = ''; codeInput.focus(); }
  const mfaErr = document.getElementById('mfa-login-error');
  if (mfaErr) mfaErr.classList.add('hidden');

  queueAuthLucideCreateIcons();
}

async function submitMfaCode() {
  const code    = (document.getElementById('mfa-login-code')?.value || '').trim();
  const errEl   = document.getElementById('mfa-login-error');
  const btn     = document.getElementById('btn-mfa-submit');
  errEl.classList.add('hidden');
  if (code.length !== 6) { errEl.innerText = 'Insira o código de 6 dígitos.'; errEl.classList.remove('hidden'); return; }

  btn.disabled  = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> VERIFICANDO...`;
  queueAuthLucideCreateIcons();

  const { error } = await supabaseClient.auth.mfa.verify({
    factorId:    _mfaFactorId,
    challengeId: _mfaChallengeId,
    code,
  });

  if (error) {
    errEl.innerText = 'Código inválido. Tente novamente.';
    errEl.classList.remove('hidden');
    btn.disabled  = false;
    btn.innerHTML = `<i data-lucide="check" class="w-5 h-5 stroke-[3px]"></i> CONFIRMAR`;
    queueAuthLucideCreateIcons();
    return;
  }

  const { data: sessionData } = await supabaseClient.auth.getSession();
  const nextUser = sessionData?.session?.user || _pendingUser;
  await _finishLogin(nextUser, nextUser?.email || _pendingEmail || '');
}

async function cancelMfaStep() {
  await _authForceReturnToLogin();
}

async function _finishLogin(user, email) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const activeSession = sessionData?.session || null;
  _authSyncSessionIdentity(activeSession || { user });

  const isActive = await ensureUserIsActive();
  if (!isActive) {
    await blockInactiveSession();
    return;
  }

  // === ENFORCEMENT MFA PARA ADMINS ===
  // Se admin não tiver MFA configurado → setup obrigatório.
  // Se admin tiver MFA mas sessão estiver em aal1 → challenge obrigatório.
  // Só avança para carregar o app quando aal2 estiver confirmado.
  if (state.isAdmin) {
    const intercepted = await _enforceAdminMfa(user, email);
    if (intercepted) return;
  }

  const { data: postMfaSessionData } = await supabaseClient.auth.getSession();
  _authSyncSessionIdentity(postMfaSessionData?.session || activeSession || { user });
  // === FIM ENFORCEMENT MFA ===
  if (state.isAdmin || state.isGestor) {
    const adminBtn = document.getElementById('admin-toggle-btn');
    if (adminBtn) adminBtn.classList.remove('hidden');
  }

  await updateVendedorStats(email);
  startInactivityWatcher();

  document.getElementById('login-screen').classList.add('opacity-0');
  await new Promise(r => setTimeout(r, 500));
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('splash-screen').classList.remove('hidden');
  await Promise.all([
    initSplash(),
    fetchFranquia(),
    fetchFranquiasCatalog(),
    fetchProfile(),
    fetchProducts(),
    fetchClientes(),
    fetchPropostas(),
    fetchVendas(),
    fetchComponentes(),
    fetchComunicados(),
  ]);
  renderHeaderUser();
  renderTabs();
  renderContent();
  if (typeof chatBoot === 'function') await chatBoot();
  if (typeof identifyUser === 'function') identifyUser(user);
  if (typeof captureEvent === 'function') captureEvent('login_success', { source: 'portal' });
}

// --- Exibir tela de reset de senha ---
function showPasswordResetForm() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('splash-screen').classList.add('hidden');
  document.getElementById('app-content').classList.add('hidden');
  const el = document.getElementById('reset-password-screen');
  if (el) el.classList.remove('hidden');
  queueAuthLucideCreateIcons();
}

// --- Handler do formulário de nova senha ---
document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPass     = document.getElementById('reset-new-password').value;
  const confirmPass = document.getElementById('reset-confirm-password').value;
  const errorEl     = document.getElementById('reset-password-error');
  const btn         = document.getElementById('btn-submit-reset');

  errorEl.classList.add('hidden');

  if (newPass.length < 6) {
    errorEl.textContent = 'A senha deve ter pelo menos 6 caracteres.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (newPass !== confirmPass) {
    errorEl.textContent = 'As senhas não coincidem.';
    errorEl.classList.remove('hidden');
    return;
  }

  btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> SALVANDO...`;
  btn.disabled  = true;
  queueAuthLucideCreateIcons();

  const { error } = await supabaseClient.auth.updateUser({ password: newPass });

  btn.disabled  = false;
  btn.innerHTML = `<i data-lucide="check" class="w-5 h-5 stroke-[3px]"></i> <span>SALVAR NOVA SENHA</span>`;
  queueAuthLucideCreateIcons();

  if (error) {
    errorEl.textContent = 'Nao foi possivel salvar a nova senha. Tente novamente.';
    errorEl.classList.remove('hidden');
  } else {
    if (typeof clearSessionState === 'function') clearSessionState();
    await supabaseClient.auth.signOut().catch(() => {});
    if (typeof resetUser === 'function') resetUser();
    _isPasswordRecovery = false;
    // limpa o hash da URL sem recarregar a página
    history.replaceState(null, '', window.location.pathname);
    document.getElementById('reset-password-screen').classList.add('hidden');
    _authShowLoginScreen();
    const loginErrorEl = document.getElementById('login-error');
    loginErrorEl.textContent     = '✓ Senha atualizada com sucesso! Faça login com sua nova senha.';
    loginErrorEl.style.color     = '#22c55e';
    loginErrorEl.style.borderColor = 'rgba(34,197,94,0.3)';
    loginErrorEl.style.background  = 'rgba(34,197,94,0.08)';
    loginErrorEl.classList.remove('hidden');
  }
});

// --- Recuperação de senha ---
async function handleForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  const errorEl = document.getElementById('login-error');
  const btnForgot = document.getElementById('btn-forgot-password');
  const recoveryUntil = _recoveryGetUntil();

  if (recoveryUntil && Date.now() < recoveryUntil) {
    const waitSeconds = Math.ceil((recoveryUntil - Date.now()) / 1000);
    errorEl.innerText = `Aguarde ${waitSeconds}s antes de solicitar outro reset.`;
    errorEl.classList.remove('hidden');
    return;
  }

  if (!email) {
    errorEl.innerText = 'Insira seu e-mail no campo acima para recuperar a senha.';
    errorEl.classList.remove('hidden');
    return;
  }

  btnForgot.innerText  = 'ENVIANDO...';
  btnForgot.disabled   = true;
  errorEl.classList.add('hidden');
  _recoverySetUntil(Date.now() + (RECOVERY_COOLDOWN_SECONDS * 1000));

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

async function fetchProfile() {
  const uid = state.currentUser?.id;
  if (!uid) return;
  const { data } = await supabaseClient
    .from('profiles')
    .select('nome, telefone, avatar_url')
    .eq('id', uid)
    .single();
  if (data) {
    state.profile.nome       = data.nome       || '';
    state.profile.telefone   = data.telefone   || '';
    state.profile.avatar_url = data.avatar_url || '';
  }
}

async function updateVendedorStats(email) {
  if (!state.currentUser?.id || !email) return;

  const { data, error } = await supabaseClient.rpc('record_current_user_login');
  if (error) {
    console.warn('[updateVendedorStats] Falha ao registrar login atual.', error);
    state.comissaoPct = Number(state.comissaoPct) || 5;
    return;
  }

  const row = Array.isArray(data) ? (data[0] || null) : data;
  state.comissaoPct = Number(row?.comissao_pct) || 5;
}

async function handleLogout() {
  clearTimeout(_inactivityTimer);
  if (typeof chatTeardown === 'function') chatTeardown(true);
  try {
    await supabaseClient.auth.signOut();
  } finally {
    if (typeof clearSessionState === 'function') clearSessionState();
    if (typeof resetUser === 'function') resetUser();
  }
  window.location.reload();
}
