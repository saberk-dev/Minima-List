window.DriveSync = (function () {
  const CLIENT_ID = '286567158042-3gk1d231utf5mggarhgf9fmb28510d4i.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email';
  const FILE_NAME = 'matcha-list.json';
  const TOKEN_KEY = 'matcha-list.google-token';

  let fileId = null;

  function redirectUri() {
    return window.location.origin + window.location.pathname;
  }

  function getStoredToken() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setStoredToken(tok) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tok));
  }

  function clearStoredToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function beginSignIn() {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri(),
      response_type: 'token',
      scope: SCOPE,
      include_granted_scopes: 'true',
      prompt: 'consent',
    });
    console.log('[Matcha List] Redirecting to Google for sign-in...');
    window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  }

  function consumeRedirectFragment() {
    if (!window.location.hash || window.location.hash.length < 2) return null;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');
    const error = params.get('error');
    if (!accessToken && !error) return null;

    history.replaceState(null, '', window.location.pathname + window.location.search);

    if (error) {
      console.error('[Matcha List] OAuth redirect returned an error:', error);
      return { error };
    }
    return {
      token: {
        access_token: accessToken,
        expires_at: Date.now() + (Number(expiresIn) || 3600) * 1000 - 60000,
      },
    };
  }

  async function fetchProfileEmail(accessToken) {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error('[Matcha List] userinfo lookup failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    return data.email || null;
  }

  async function init() {
    const redirected = consumeRedirectFragment();
    if (redirected) {
      if (redirected.error) return { signedIn: false, error: redirected.error };
      const email = await fetchProfileEmail(redirected.token.access_token);
      if (!email) return { signedIn: false, error: 'no_email' };
      setStoredToken({ ...redirected.token, email });
      return { signedIn: true, email };
    }
    const stored = getStoredToken();
    if (stored && stored.access_token && stored.expires_at > Date.now()) {
      return { signedIn: true, email: stored.email };
    }
    if (stored) clearStoredToken();
    return { signedIn: false };
  }

  function getValidToken() {
    const stored = getStoredToken();
    if (stored && stored.access_token && stored.expires_at > Date.now()) {
      return stored.access_token;
    }
    return null;
  }

  async function ensureFile() {
    if (fileId) return fileId;
    const token = getValidToken();
    if (!token) throw { type: 'not_signed_in' };
    const query = encodeURIComponent(`name='${FILE_NAME}'`);
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const listData = await listRes.json();
    if (listData.files && listData.files.length > 0) {
      fileId = listData.files[0].id;
      return fileId;
    }
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] }),
    });
    const createData = await createRes.json();
    fileId = createData.id;
    return fileId;
  }

  async function pull() {
    const token = getValidToken();
    if (!token) throw { type: 'not_signed_in' };
    const id = await ensureFile();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  async function push(payload) {
    const token = getValidToken();
    if (!token) throw { type: 'not_signed_in' };
    const id = await ensureFile();
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  function signIn() {
    beginSignIn();
  }

  function signOut() {
    clearStoredToken();
    fileId = null;
  }

  return { init, signIn, signOut, pull, push };
})();
