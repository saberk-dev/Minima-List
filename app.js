(() => {
  const STORAGE_KEY = 'matcha-list.tasks.v1';

  const form = document.getElementById('add-form');
  const input = document.getElementById('new-task-input');
  const list = document.getElementById('task-list');
  const emptyState = document.getElementById('empty-state');
  const emptyStateText = document.getElementById('empty-state-text');
  const filtersNav = document.getElementById('filters');
  const countEl = document.getElementById('task-count');
  const clearBtn = document.getElementById('clear-completed');
  const template = document.getElementById('task-item-template');

  let tasks = loadTasks();
  let filter = 'all';

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function addTask(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    tasks.unshift({ id: makeId(), text: trimmed, done: false, createdAt: Date.now() });
    saveTasks();
    render();
  }

  function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    task.done = !task.done;
    saveTasks();
    render();
  }

  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
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
    saveTasks();
  }

  function clearCompleted() {
    tasks = tasks.filter(t => !t.done);
    saveTasks();
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
})();
