const SESSION_KEY = 'schema_editor_session';
const GOOGLE_CLIENT_ID = window.APP_CONFIG?.googleClientId;

let tokenClient;

function showLoginError(message) {
  const el = document.getElementById('login-error');
  if (el) el.textContent = message || '';
}

function initGoogleAuth(onSuccess) {
  if (!GOOGLE_CLIENT_ID) {
    showLoginError('Не настроен GOOGLE_CLIENT_ID (assets/js/config.js).');
    return;
  }
  if (!window.google?.accounts?.oauth2) {
    showLoginError('Google API не загрузился. Обновите страницу.');
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'openid email profile https://www.googleapis.com/auth/spreadsheets',
    callback: async (resp) => {
      if (resp.error) {
        const msg = resp.error === 'access_denied' ? 'Доступ отклонён'
          : resp.error === 'popup_closed' ? 'Окно входа закрыто'
            : 'Ошибка входа: ' + resp.error;
        showLoginError(msg);
        return;
      }

      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {Authorization: `Bearer ${resp.access_token}`}
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const user = await res.json();
        if (!user.email) throw new Error('пустой профиль');

        const session = {
          email: user.email,
          name: user.name,
          picture: user.picture,
          accessToken: resp.access_token,
          exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        showLoginError('');
        onSuccess?.();
      } catch (e) {
        console.error('Google userinfo failed:', e);
        showLoginError('Не удалось получить профиль Google: ' + (e.message || e));
      }
    }
  });
}

const Auth = {
  login() {
    if (!tokenClient) {
      showLoginError('Google API не загрузился — обновите страницу.');
      return;
    }
    tokenClient.requestAccessToken();
  },

  getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (!s.exp || s.exp < Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  },

  /**
   * Обновляет токен в существующей сессии, чтобы GIS-токен,
   * полученный после 401, переживал перезагрузку страницы.
   */
  updateSession(accessToken, expiresIn) {
    if (!accessToken) return;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      s.accessToken = accessToken;
      s.exp = Date.now() + (Number(expiresIn) || 3600) * 1000;
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {
      // битую сессию просто игнорируем — при следующем входе перезапишется
    }
  },

  clearSession() {
    localStorage.removeItem(SESSION_KEY);
  },

  logout() {
    const s = this.getSession();
    if (s?.accessToken && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(s.accessToken);
    }
    this.clearSession();
    location.replace('login.html');
  },
};
