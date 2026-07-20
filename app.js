(() => {
  const STORAGE_KEY = 'matcha-list.tasks.v2';

  const form = document.getElementById('add-form');
  const input = document.getElementById('new-task-input');
  const list = document.getElementById('task-list');
  const emptyState = document.getElementById('empty-state');
  const emptyStateText = document.getElementById('empty-state-text');
  const filtersNav = document.getElementById('filters');
  const countEl = document.getElementById('task-count');
  const clearBtn = document.getElementById('clear-completed');
  const template = document.getElementById('task-item-template');
  const signInBtn = document.getElementById('google-signin-btn');
  const signOutBtn = document.getElementById('google-signout-btn');
  const syncStatusEl = document.getElementById('sync-status');

  let tasks = [];
  let updatedAt = 0;
  let filter = 'all';
  let signedIn = false;
  let pushTimer = null;
  let syncing = false;

  loadLocal();

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      tasks = (parsed && parsed.tasks) || [];
      updatedAt = (parsed && parsed.updatedAt) || 0;
    } catch (e) {
      tasks = [];
      updatedAt = 0;
    }
  }

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ updatedAt, tasks }));
  }

  function touch() {
    updatedAt = Date.now();
    persistLocal();
    schedulePush();
  }

  function schedulePush() {
    if (!signedIn) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      window.DriveSync.push({ updatedAt, tasks }).catch(() => {});
    }, 800);
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function addTask(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    tasks.unshift({ id: makeId(), text: trimmed, done: false, createdAt: Date.now() });
    touch();
    render();
  }

  function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    task.done = !task.done;
    touch();
    render();
  }

  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    touch();
    render();
  }

  function editTask(id, text) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const trimmed = text.trim();
    if (!trimmed) {
      deleteTask(id);
      return;
    }
    task.text = trimmed;
    touch();
  }

  function clearCompleted() {
    tasks = tasks.filter(t => !t.done);
    touch();
    render();
  }

  function getFiltered() {
    if (filter === 'active') return tasks.filter(t => !t.done);
    if (filter === 'done') return tasks.filter(t => t.done);
    return tasks;
  }

  function render() {
    const filtered = getFiltered();
    list.innerHTML = '';

    filtered.forEach(task => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.id = task.id;
      node.classList.toggle('is-done', task.done);

      const checkBtn = node.querySelector('.task__check');
      checkBtn.setAttribute('aria-pressed', String(task.done));
      checkBtn.addEventListener('click', () => toggleTask(task.id));

      const textEl = node.querySelector('.task__text');
      textEl.textContent = task.text;
      textEl.setAttribute('contenteditable', 'true');
      textEl.addEventListener('blur', () => editTask(task.id, textEl.textContent));
      textEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          textEl.blur();
        }
      });

      const deleteBtn = node.querySelector('.task__delete');
      deleteBtn.addEventListener('click', () => deleteTask(task.id));

      list.appendChild(node);
    });

    const isEmpty = filtered.length === 0;
    emptyState.hidden = !isEmpty;
    if (isEmpty) {
      if (tasks.length === 0) {
        emptyStateText.textContent = 'All clear. Time for a sip.';
      } else if (filter === 'active') {
        emptyStateText.textContent = 'Nothing left to do. Nicely done.';
      } else {
        emptyStateText.textContent = 'No finished tasks yet.';
      }
    }

    const remaining = tasks.filter(t => !t.done).length;
    countEl.textContent = `${remaining} item${remaining === 1 ? '' : 's'} left`;

    const hasCompleted = tasks.some(t => t.done);
    clearBtn.disabled = !hasCompleted;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    addTask(input.value);
    input.value = '';
    input.focus();
  });

  filtersNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.filters__btn');
    if (!btn) return;
    filter = btn.dataset.filter;
    filtersNav.querySelectorAll('.filters__btn').forEach(b => {
      b.classList.toggle('is-active', b === btn);
    });
    render();
  });

  clearBtn.addEventListener('click', clearCompleted);

  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // ---------- Google Drive sync ----------

  function setSyncUI(email) {
    signedIn = !!email;
    signInBtn.hidden = signedIn;
    signOutBtn.hidden = !signedIn;
    syncStatusEl.hidden = !signedIn;
    if (signedIn) syncStatusEl.textContent = `Synced · ${email}`;
  }

  async function pullAndMerge() {
    if (!signedIn || syncing) return;
    syncing = true;
    try {
      const remote = await window.DriveSync.pull();
      if (!remote) {
        await window.DriveSync.push({ updatedAt, tasks });
      } else if (remote.updatedAt > updatedAt) {
        tasks = remote.tasks || [];
        updatedAt = remote.updatedAt;
        persistLocal();
        render();
      } else if (updatedAt > remote.updatedAt) {
        await window.DriveSync.push({ updatedAt, tasks });
      }
    } catch (e) {
      console.error('[Matcha List] Sync pull/push failed:', e);
    } finally {
      syncing = false;
    }
  }

  signInBtn.addEventListener('click', async () => {
    const originalLabel = signInBtn.innerHTML;
    try {
      const email = await window.DriveSync.signIn();
      if (email) {
        setSyncUI(email);
        await pullAndMerge();
      } else {
        console.error('[Matcha List] Sign-in returned no email — token was granted but profile lookup failed.');
        showSyncError('Signed in, but couldn’t confirm account. Try again.');
      }
    } catch (e) {
      console.error('[Matcha List] Google sign-in failed:', e);
      const reason = (e && (e.type || e.error)) || 'unknown';
      if (reason === 'popup_closed' || reason === 'popup_failed_to_open') {
        showSyncError('Popup was blocked or closed — allow popups for this site and try again.');
      } else if (reason === 'timed_out') {
        showSyncError('Sign-in didn’t complete — try again, or use Chrome if you were on Safari.');
      } else {
        showSyncError(`Sign-in failed (${reason}). Check the console for details.`);
      }
    } finally {
      signInBtn.innerHTML = originalLabel;
    }
  });

  function showSyncError(message) {
    syncStatusEl.hidden = false;
    syncStatusEl.textContent = message;
    syncStatusEl.classList.add('sync-bar__status--error');
    setTimeout(() => {
      if (!signedIn) {
        syncStatusEl.hidden = true;
        syncStatusEl.classList.remove('sync-bar__status--error');
      }
    }, 6000);
  }

  signOutBtn.addEventListener('click', () => {
    window.DriveSync.signOut();
    setSyncUI(null);
  });

  window.addEventListener('load', async () => {
    if (!window.DriveSync) return;
    const email = await window.DriveSync.trySilentSignIn();
    if (email) {
      setSyncUI(email);
      await pullAndMerge();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pullAndMerge();
  });
  window.addEventListener('focus', () => pullAndMerge());
})();
