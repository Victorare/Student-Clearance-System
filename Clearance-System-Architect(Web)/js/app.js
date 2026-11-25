import {
  friendlyError,
  getProfile,
  getStudentNotifications,
  markAllStudentNotificationsRead,
  markStudentNotificationRead
} from './demo-store.js?v=olopsc-v9';
import { isStaffRole } from './roles.js?v=olopsc-v9';
import { showToast } from './toast.js?v=olopsc-v4';
import { DEPARTMENTS } from './departments.js?v=olopsc-v4';
import { initializeSettings } from './settings.js?v=olopsc-v4';

export { DEPARTMENTS };

export function toAppUser(profile) {
  const name = profile.full_name || profile.email?.split('@')[0] || 'Student';
  return {
    id: profile.id,
    email: profile.email,
    username: profile.email,
    role: profile.role.toLowerCase(),
    name,
    studentId: profile.student_id,
    program: profile.program,
    year: profile.year_level,
    schoolYear: profile.school_year || profile.academic_year,
    borrowedBooksCount: profile.borrowed_books_count || 0,
    requests: []
  };
}

export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function initials(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'U';
}

export function getRequest(user, departmentId) {
  return (user.requests || []).find((request) => request.department === departmentId) ||
    { department: departmentId, status: 'pending', submittedAt: '', attachment: '', note: '', adminNote: '', notSubmitted: true };
}

export function getProgress(user) {
  const departments = user.departments || DEPARTMENTS;
  const approved = departments.filter((department) => getRequest(user, department.id).status === 'approved').length;
  return { approved, total: departments.length, percent: Math.round((approved / departments.length) * 100) };
}

export function statusBadge(status) {
  const valid = ['approved', 'pending', 'rejected', 'not-submitted'].includes(status) ? status : 'pending';
  const label = valid === 'not-submitted' ? 'not submitted' : valid;
  return '<span class="status-badge status-' + valid + '">' + label + '</span>';
}

export function showNotice(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', Boolean(isError));
  element.setAttribute('role', isError ? 'alert' : 'status');
  element.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  element.hidden = false;
}

export function applyUser(profile) {
  const user = toAppUser(profile);
  const setText = (selector, value) => document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value == null || value === '' ? '—' : value;
  });
  setText('[data-user-name]', user.name);
  setText('[data-avatar]', initials(user.name));
  setText('[data-student-name]', user.name);
  setText('[data-student-id]', user.studentId);
  setText('[data-student-program]', user.program);
  setText('[data-student-year]', user.year);
  setText('[data-school-year]', user.schoolYear);
  setText('[data-borrowed-books-count]', user.borrowedBooksCount);
  setText('[data-username]', user.email);
  setText('[data-year]', String(new Date().getFullYear()));
  setText('[data-first-name]', user.name.split(/\s+/)[0]);
  setText('[data-user-role]', user.role === 'admin' || user.role === 'super_admin' ? 'Super Admin' :
    user.role === 'admin-dean' ? 'Admin - Dean' :
      user.role.charAt(0).toUpperCase() + user.role.slice(1));
}

export async function guardPage() {
  const requiredRole = document.body.dataset.requiresRole;
  try {
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
      if (requiredRole) window.location.replace('login.html');
      return null;
    }

    const { data: profile, error: profileError } = await window.supabaseClient
      .schema('public')
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    if (profileError) throw profileError;
    if (!profile) {
      if (requiredRole) window.location.replace('login.html');
      return null;
    }

    applyUser(profile);
    const role = profile.role.toLowerCase();
    const isStudent = role === 'student';
    if (requiredRole === 'student' && !isStudent) {
      window.location.replace(isStaffRole(role) ? 'admin-dashboard.html' : 'login.html');
      return null;
    }
    if (requiredRole === 'staff' && !isStaffRole(role)) {
      window.location.replace(isStudent ? 'student-dashboard.html' : 'login.html');
      return null;
    }
    if (!requiredRole && window.location.pathname.endsWith('login.html')) {
      window.location.replace(isStudent ? 'student-dashboard.html' : 'admin-dashboard.html');
      return null;
    }
    return toAppUser(profile);
  } catch (error) {
    showToast(friendlyError(error, 'We could not verify your account. Please sign in again.'), 'error');
    if (requiredRole) window.location.replace('login.html');
    return null;
  }
}

function initNotifications() {
  const requiredRole = document.body.dataset.requiresRole;
  if (window.location.pathname.endsWith('login.html')) return;
  if (requiredRole === 'student') {
    initStudentNotifications();
    return;
  }
  if (requiredRole) return;

  let profile;
  try {
    profile = getProfile();
  } catch (error) {
    showToast(friendlyError(error, 'Notifications could not be initialized.'), 'error');
    return;
  }
  const topActions = document.querySelector('.top-actions');
  if (!profile || profile.role !== 'student' || !topActions) return;
  if (!topActions.querySelector('[data-notification-toggle]')) {
    topActions.insertAdjacentHTML('afterbegin',
      '<button class="icon-button notification-toggle" type="button" data-notification-toggle aria-label="Notifications" aria-expanded="false" title="Notifications"><span aria-hidden="true">🔔</span><span class="notification-count" data-notification-count hidden>0</span></button>');
  }
  if (!document.querySelector('[data-notification-panel]')) {
    document.body.insertAdjacentHTML('beforeend', `
      <section class="notification-panel" data-notification-panel aria-label="Notifications" hidden>
        <header class="notification-panel-header">
          <b>Notifications</b>
          <button type="button" class="text-link" data-notification-mark-all>Mark all as read</button>
        </header>
        <div class="notification-panel-list" data-notification-list aria-live="polite"></div>
      </section>
    `);
  }

  const button = topActions.querySelector('[data-notification-toggle]');
  const panel = document.querySelector('[data-notification-panel]');
  const list = document.querySelector('[data-notification-list]');
  const count = document.querySelector('[data-notification-count]');
  const markAll = document.querySelector('[data-notification-mark-all]');

  const render = () => {
    try {
      const notifications = getStudentNotifications();
      const unread = notifications.filter((notification) => !notification.read).length;
      count.textContent = unread > 99 ? '99+' : String(unread);
      count.hidden = unread === 0;
      button.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
      markAll.disabled = unread === 0;
      list.innerHTML = notifications.length
        ? notifications.map((notification) => {
          const date = new Date(notification.date);
          const formattedDate = Number.isNaN(date.getTime())
            ? ''
            : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
          return '<article class="notification-item ' + (notification.read ? '' : 'unread') + '">' +
            '<span class="notification-status ' + (notification.type === 'approved' ? 'notification-approved' : 'notification-rejected') + '">' +
            (notification.type === 'approved' ? '✓' : '!') + '</span><div class="notification-copy">' +
            '<b>' + escapeHtml(notification.message) + '</b>' +
            (notification.reason ? '<small>Reason: ' + escapeHtml(notification.reason) + '</small>' : '') +
            '<time>' + escapeHtml(formattedDate) + '</time></div>' +
            (!notification.read ? '<button type="button" class="notification-read" data-notification-read="' + escapeHtml(notification.id) + '">Mark read</button>' : '') +
            '</article>';
        }).join('')
        : '<p class="notification-empty">You’re all caught up. New clearance updates will appear here.</p>';
    } catch (error) {
      showToast(friendlyError(error, 'Notifications could not be loaded.'), 'error');
    }
  };
  const close = () => {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  render();
  button.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) render();
  });
  markAll.addEventListener('click', () => {
    try {
      markAllStudentNotificationsRead();
      render();
    } catch (error) {
      showToast(friendlyError(error, 'Notifications could not be marked as read.'), 'error');
    }
  });
  list.addEventListener('click', (event) => {
    const readButton = event.target.closest('[data-notification-read]');
    if (!readButton) return;
    try {
      markStudentNotificationRead(readButton.dataset.notificationRead);
      render();
    } catch (error) {
      showToast(friendlyError(error, 'This notification could not be marked as read.'), 'error');
    }
  });
  document.addEventListener('click', (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === 'olopsc_clearance_demo_notifications') render();
  });
  window.addEventListener('olopsc:notifications-updated', render);
  document.querySelectorAll('[data-notification-view]').forEach((viewAll) => {
    viewAll.addEventListener('click', (event) => {
      event.preventDefault();
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      render();
    });
  });
}

function initStudentNotifications() {
  const topActions = document.querySelector('.top-actions');
  if (!topActions) return;
  if (!topActions.querySelector('[data-notification-toggle]')) {
    topActions.insertAdjacentHTML('afterbegin',
      '<button class="icon-button notification-toggle" type="button" data-notification-toggle aria-label="Notifications" aria-expanded="false" title="Notifications"><span aria-hidden="true">🔔</span><span class="notification-count" data-notification-count hidden></span></button>');
  }
  if (!document.querySelector('[data-notification-panel]')) {
    document.body.insertAdjacentHTML('beforeend', `
      <section class="notification-panel" data-notification-panel aria-label="Notifications" hidden>
        <header class="notification-panel-header">
          <b>Notifications</b>
          <button type="button" class="text-link" data-notification-mark-all>Mark all as read</button>
        </header>
        <div class="notification-panel-list" data-notification-list aria-live="polite"></div>
      </section>
    `);
  }

  const button = topActions.querySelector('[data-notification-toggle]');
  const panel = document.querySelector('[data-notification-panel]');
  const list = document.querySelector('[data-notification-list]');
  const count = document.querySelector('[data-notification-count]');
  const markAll = document.querySelector('[data-notification-mark-all]');
  const readIds = new Set();
  let notifications = [];

  const render = () => {
    const unreadCount = notifications.filter((notification) => !readIds.has(notification.id)).length;
    count.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    count.hidden = unreadCount === 0;
    button.setAttribute('aria-label', unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications');
    markAll.disabled = unreadCount === 0;
    list.innerHTML = notifications.length
      ? notifications.map((notification) => {
        const date = new Date(notification.date);
        const formattedDate = Number.isNaN(date.getTime())
          ? ''
          : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
        const isRead = readIds.has(notification.id);
        return '<article class="notification-item ' + (isRead ? '' : 'unread') + '">' +
          '<span class="notification-status ' + (notification.type === 'approved' ? 'notification-approved' : 'notification-rejected') + '">' +
          (notification.type === 'approved' ? '✓' : '!') + '</span><div class="notification-copy">' +
          '<b>' + escapeHtml(notification.message) + '</b>' +
          (notification.reason ? '<small>Reason: ' + escapeHtml(notification.reason) + '</small>' : '') +
          '<time>' + escapeHtml(formattedDate) + '</time></div>' +
          (!isRead ? '<button type="button" class="notification-read" data-notification-read="' + escapeHtml(notification.id) + '">Mark read</button>' : '') +
          '</article>';
      }).join('')
      : '<p class="notification-empty">You’re all caught up. New clearance updates will appear here.</p>';
  };

  render();
  window.addEventListener('olopsc:student-notifications', (event) => {
    notifications = event.detail;
    render();
  });
  button.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) render();
  });
  markAll.addEventListener('click', () => {
    notifications.forEach((notification) => readIds.add(notification.id));
    render();
  });
  list.addEventListener('click', (event) => {
    const readButton = event.target.closest('[data-notification-read]');
    if (!readButton) return;
    readIds.add(readButton.dataset.notificationRead);
    render();
  });
  document.addEventListener('click', (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }
  });
  document.querySelectorAll('[data-notification-view]').forEach((viewAll) => {
    viewAll.addEventListener('click', (event) => {
      event.preventDefault();
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      render();
    });
  });
}

function initShell() {
  initializeSettings();
  initNotifications();
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
  document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await window.handleSignOut();
    } catch (error) {
      showToast(friendlyError(error, 'We could not sign you out. Please try again.'), 'error');
    }
  }));
  const sidebar = document.getElementById('sidebar');
  const overlay = document.querySelector('[data-mobile-overlay]');
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const isMobileNav = () => window.matchMedia('(max-width: 780px)').matches;
  const syncSidebarAccessibility = () => {
    if (!sidebar) return;
    const collapsed = isMobileNav() && !sidebar.classList.contains('open');
    sidebar.toggleAttribute('inert', collapsed);
    sidebar.setAttribute('aria-hidden', String(collapsed));
  };
  const closeMenu = () => {
    const shouldRestoreFocus = isMobileNav() && sidebar?.contains(document.activeElement);
    sidebar?.classList.remove('open');
    overlay?.classList.remove('visible');
    menuToggle?.setAttribute('aria-expanded', 'false');
    menuToggle?.setAttribute('aria-label', 'Open navigation');
    syncSidebarAccessibility();
    if (shouldRestoreFocus) menuToggle?.focus();
  };
  document.querySelectorAll('[data-menu-toggle]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
    const updateLabel = (isOpen) => button.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    button.addEventListener('click', () => {
      const isOpen = sidebar ? !sidebar.classList.contains('open') : false;
      sidebar?.classList.toggle('open', isOpen);
      overlay?.classList.toggle('visible', isOpen);
      button.setAttribute('aria-expanded', String(isOpen));
      updateLabel(isOpen);
      syncSidebarAccessibility();
    });
  });
  syncSidebarAccessibility();
  window.addEventListener('resize', () => {
    if (!isMobileNav() && sidebar?.classList.contains('open')) closeMenu();
    else syncSidebarAccessibility();
  }, { passive: true });
  sidebar?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  overlay?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar?.classList.contains('open')) closeMenu();
  });
  document.querySelectorAll('[data-print]').forEach((button) => button.addEventListener('click', () => window.print()));
}

initShell();
