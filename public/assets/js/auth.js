const SESSION_KEY = 'schema_editor_session';
const GOOGLE_CLIENT_ID = window.APP_CONFIG?.googleClientId;

let tokenClient;

function initGoogleAuth(onSuccess) {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'openid email profile https://www.googleapis.com/auth/spreadsheets',
    callback: async (resp) => {
      if (resp.error) return;

      const user = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${resp.access_token}` }
      }).then(r => r.json());

      const session = {
        email: user.email,
        name: user.name,
        picture: user.picture,
        accessToken: resp.access_token,
        exp: Date.now() + (resp.expires_in || 3600) * 1000
      };

      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      onSuccess?.();
    }
  });
}

const Auth = {
  login() { tokenClient.requestAccessToken(); },

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

  logout() {
    const s = this.getSession();
    if (s?.accessToken && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(s.accessToken);
    }
    localStorage.removeItem(SESSION_KEY);
    location.replace('login.html');
  }
};