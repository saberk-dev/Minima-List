window.DriveSync = (function () {
  const CLIENT_ID = '286567158042-3gk1d231utf5mggarhgf9fmb28510d4i.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE_NAME = 'matcha-list.json';
  const LINKED_EMAIL_KEY = 'matcha-list.google-email';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let fileId = null;
  let signedInEmail = null;

  function isReady() {
    return typeof google !== 'undefined' && !!(google.accounts && google.accounts.oauth2);
  }

  function ensureTokenClient() {
    if (tokenClient) return tokenClient;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {},
    });
    return tokenClient;
  }

  function requestToken(prompt) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        console.error('[Matcha List] Token request timed out after 45s (prompt=' + prompt + ').');
        reject({ type: 'timed_out' });
      }, 45000);

      const client = ensureTokenClient();
      client.callback = (resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.log('[Matcha List] Token callback fired.', resp && resp.error ? resp : { hasToken: !!(resp && resp.access_token) });
        if (resp && resp.error) {
          reject(resp);
          return;
        }
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60000;
        resolve(resp);
      };
      client.error_callback = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.error('[Matcha List] Token error_callback fired.', err);
        reject(err);
      };
      console.log('[Matcha List] Requesting access token (prompt=' + prompt + ')...');
      client.requestAccessToken({ prompt });
    });
  }

  async function fetchProfileEmail() {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  }

  async function getValidToken() {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    await requestToken('');
    return accessToken;
  }

  async function ensureFile() {
    if (fileId) return fileId;
    const token = await getValidToken();
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
    const token = await getValidToken();
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
    const token = await getValidToken();
    const id = await ensureFile();
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async function signIn() {
    await requestToken('consent');
    signedInEmail = await fetchProfileEmail();
    if (signedInEmail) localStorage.setItem(LINKED_EMAIL_KEY, signedInEmail);
    return signedInEmail;
  }

  async function trySilentSignIn() {
    const savedEmail = localStorage.getItem(LINKED_EMAIL_KEY);
    if (!savedEmail || !isReady()) return null;
    try {
      await requestToken('');
      signedInEmail = await fetchProfileEmail();
      return signedInEmail;
    } catch (e) {
      return null;
    }
  }

  function signOut() {
    if (accessToken && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    fileId = null;
    signedInEmail = null;
    localStorage.removeItem(LINKED_EMAIL_KEY);
  }

  function getEmail() {
    return signedInEmail;
  }

  return { isReady, signIn, signOut, trySilentSignIn, pull, push, getEmail };
})();
