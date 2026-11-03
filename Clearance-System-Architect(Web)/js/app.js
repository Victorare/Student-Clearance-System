(function () {
  'use strict';

  const USERS_KEY = 'olopsc_clearance_users';
  const SESSION_KEY = 'olopsc_clearance_session';
  const THEME_KEY = 'olopsc_clearance_theme';
  const LEGACY_STORAGE_KEYS = {
    [USERS_KEY]: 'northstar_clearance_users',
    [SESSION_KEY]: 'northstar_clearance_session',
    [THEME_KEY]: 'northstar_clearance_theme'
  };
  const DEPARTMENTS = [
    { id: 'library', name: 'Library', icon: '▤', requirement: 'Return all borrowed books and settle any outstanding library fees.' },
    { id: 'accounting', name: 'Accounting', icon: '＄', requirement: 'Settle outstanding tuition, fees, or payment arrangements.' },
    { id: 'laboratory', name: 'Laboratory', icon: '⚗', requirement: 'Return borrowed equipment and settle laboratory charges.' },
    { id: 'registrar', name: 'Registrar', icon: '▣', requirement: 'Confirm academic records and submit any required forms.' },
    { id: 'student-affairs', name: 'Student Affairs', icon: '✳', requirement: 'Complete student organization and conduct requirements.' }
  ];

  function migrateLegacyStorage() {
    try {
      Object.entries(LEGACY_STORAGE_KEYS).forEach(([key, legacyKey]) => {
        const legacyValue = localStorage.getItem(legacyKey);
        if (localStorage.getItem(key) === null && legacyValue !== null) localStorage.setItem(key, legacyValue);
        if (legacyValue !== null) localStorage.removeItem(legacyKey);
      });
    } catch (error) {
      console.error('Could not migrate saved clearance data:', error);
    }
  }

  function seedUsers() {
    try {
      const stored = localStorage.getItem(USERS_KEY);
      if (stored) {
        const users = JSON.parse(stored);
        if (!Array.isArray(users)) throw new Error('Saved clearance records are not in the expected format.');
        if (users.length) return users;
      }
    } catch (error) {
      console.error('Could not read saved clearance records:', error);
      return [];
    }

    const today = new Date();
    const priorDay = new Date(today);
    priorDay.setDate(today.getDate() - 1);
    const iso = (date) => date.toISOString();
    const student = {
      username: 'student01', password: 'student123', role: 'student',
      studentId: '2024-01842', name: 'Leah Santos', program: 'BS Information Systems', year: '3rd Year',
      requests: [
        { department: 'library', status: 'approved', submittedAt: iso(priorDay), attachment: '', note: '', adminNote: '' },
        { department: 'accounting', status: 'pending', submittedAt: iso(today), attachment: 'account-statement.pdf', note: 'Payment confirmation attached.', adminNote: '' },
        { department: 'laboratory', status: 'pending', submittedAt: iso(today), attachment: '', note: '', adminNote: '' },
        { department: 'registrar', status: 'rejected', submittedAt: iso(priorDay), attachment: '', note: '', adminNote: 'Please submit the completed records verification form.' },
        { department: 'student-affairs', status: 'approved', submittedAt: iso(priorDay), attachment: '', note: '', adminNote: '' }
      ]
    };
    const users = [
      student,
      { username: 'admin', password: 'admin123', role: 'admin', name: 'Morgan Reyes', requests: [] }
    ];
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      return users;
    } catch (error) {
      console.error('Could not initialize clearance records:', error);
      return users;
    }
  }

  function getUsers() {
    try {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      return Array.isArray(users) ? users : [];
    } catch (error) {
      console.error('Could not load clearance records:', error);
      return [];
    }
  }

  function saveUsers(users) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      return true;
    } catch (error) {
      console.error('Could not save clearance records:', error);
      return false;
    }
  }

  function getSession() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!session || typeof session.username !== 'string' || !['student', 'admin'].includes(session.role)) return null;
      return session;
    } catch (error) {
      console.error('Could not load the sign-in session:', error);
      return null;
    }
  }

  function currentUser() {
    const session = getSession();
    return session ? getUsers().find((user) => user.username === session.username && user.role === session.role) || null : null;
  }

  function signOut() {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEYS[SESSION_KEY]);
      localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.error('Could not clear the sign-in session:', error);
      showShellNotice('Your session could not be cleared from this browser. Please enable browser storage and try again.');
      return;
    }
    window.location.href = 'login.html';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'U';
  }

  function getRequest(user, departmentId) {
    return (user.requests || []).find((request) => request.department === departmentId) ||
      { department: departmentId, status: 'pending', submittedAt: '', attachment: '', note: '', adminNote: '', notSubmitted: true };
  }

  function getProgress(user) {
    const approved = DEPARTMENTS.filter((department) => getRequest(user, department.id).status === 'approved').length;
    return { approved, total: DEPARTMENTS.length, percent: Math.round((approved / DEPARTMENTS.length) * 100) };
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => { element.textContent = value; });
  }

  function applyUser(user) {
    if (!user) return;
    setText('[data-user-name]', user.name);
    setText('[data-avatar]', initials(user.name));
    setText('[data-student-name]', user.name);
    setText('[data-student-id]', user.studentId || '—');
    setText('[data-student-program]', user.program || '—');
    setText('[data-student-year]', user.year || '—');
    setText('[data-username]', user.username);
    setText('[data-year]', String(new Date().getFullYear()));
    const firstName = user.name.split(/\s+/)[0];
    setText('[data-first-name]', firstName);
  }

  function statusBadge(status) {
    const valid = ['approved', 'pending', 'rejected', 'not-submitted'].includes(status) ? status : 'pending';
    const label = valid === 'not-submitted' ? 'not submitted' : valid;
    return '<span class="status-badge status-' + valid + '">' + label + '</span>';
  }

  function showNotice(element, message, isError) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', Boolean(isError));
    element.hidden = false;
  }

  function showShellNotice(message) {
    const container = document.querySelector('.page-content') || document.querySelector('.login-box');
    if (!container) return;
    let notice = document.getElementById('app-storage-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'app-storage-notice';
      notice.className = 'notice error';
      notice.setAttribute('role', 'alert');
      container.prepend(notice);
    }
    notice.textContent = message;
    notice.hidden = false;
  }

  function guardPage() {
    const requiredRole = document.body.dataset.requiresRole;
    const session = getSession();
    const user = currentUser();
    if (requiredRole && (!session || !user || session.role !== requiredRole)) {
      window.location.replace('login.html');
      return null;
    }
    if (user) {
      applyUser(user);
      if (!requiredRole && window.location.pathname.endsWith('login.html')) {
        window.location.replace(user.role === 'admin' ? 'admin-dashboard.html' : 'student-dashboard.html');
      }
    }
    return user;
  }

  function initShell() {
    let storedTheme = null;
    try {
      storedTheme = localStorage.getItem(THEME_KEY);
    } catch (error) {
      console.error('Could not load the theme preference:', error);
      showShellNotice('Your saved display preference could not be loaded. The default theme is active.');
    }
    document.body.classList.toggle('dark-mode', storedTheme === 'dark');
    const dateElement = document.querySelector('[data-datetime]');
    if (dateElement) {
      const updateDate = () => {
        dateElement.textContent = new Intl.DateTimeFormat(undefined, {
          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        }).format(new Date());
      };
      updateDate();
      window.setInterval(updateDate, 60000);
    }
    document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', signOut));
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => button.addEventListener('click', () => {
      const dark = !document.body.classList.contains('dark-mode');
      document.body.classList.toggle('dark-mode', dark);
      try {
        localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
      } catch (error) {
        console.error('Could not save the theme preference:', error);
        showShellNotice('Your theme changed, but the preference could not be saved in this browser.');
      }
    }));
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('[data-mobile-overlay]');
    const menuToggle = document.querySelector('[data-menu-toggle]');
    const closeMenu = () => {
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('visible');
      if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    };
    document.querySelectorAll('[data-menu-toggle]').forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => {
        const isOpen = sidebar ? !sidebar.classList.contains('open') : false;
        if (sidebar) sidebar.classList.toggle('open', isOpen);
        if (overlay) overlay.classList.toggle('visible', isOpen);
        button.setAttribute('aria-expanded', String(isOpen));
      });
    });
    if (overlay) overlay.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sidebar && sidebar.classList.contains('open')) closeMenu();
    });
    document.querySelectorAll('[data-print]').forEach((button) => button.addEventListener('click', () => window.print()));
  }

  const state = { departments: DEPARTMENTS, usersKey: USERS_KEY, sessionKey: SESSION_KEY };
  window.ClearanceApp = {
    state, seedUsers, getUsers, saveUsers, getSession, currentUser, signOut, escapeHtml,
    initials, getRequest, getProgress, statusBadge, showNotice, guardPage, initShell
  };
  migrateLegacyStorage();
  seedUsers();
  initShell();
  document.addEventListener('DOMContentLoaded', guardPage);
})();
