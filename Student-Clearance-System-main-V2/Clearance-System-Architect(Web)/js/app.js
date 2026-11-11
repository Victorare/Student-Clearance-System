import { friendlyError, getProfile, signOut } from './demo-store.js';
import { isStaffRole } from './roles.js';
import { showToast } from './toast.js';
import { DEPARTMENTS } from './departments.js';

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
    year: profile.academic_year,
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
  element.hidden = false;
}

function applyUser(profile) {
  const user = toAppUser(profile);
  const setText = (selector, value) => document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value || '—';
  });
  setText('[data-user-name]', user.name);
  setText('[data-avatar]', initials(user.name));
  setText('[data-student-name]', user.name);
  setText('[data-student-id]', user.studentId);
  setText('[data-student-program]', user.program);
  setText('[data-student-year]', user.year);
  setText('[data-username]', user.email);
  setText('[data-year]', String(new Date().getFullYear()));
  setText('[data-first-name]', user.name.split(/\s+/)[0]);
  setText('[data-user-role]', user.role);
}

export async function guardPage() {
  const requiredRole = document.body.dataset.requiresRole;
  try {
    const profile = getProfile();
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

function handleSignOut() {
  try {
    signOut();
  } catch (error) {
    showToast(friendlyError(error, 'We could not sign you out. Please try again.'), 'error');
    return;
  }
  window.location.replace('login.html');
}

function initShell() {
  try {
    document.body.classList.toggle('dark-mode', localStorage.getItem('olopsc_clearance_theme') === 'dark');
  } catch {
    showToast('Your display preference could not be loaded. The default theme is active.', 'info');
  }
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
  document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', handleSignOut));
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => button.addEventListener('click', () => {
    const dark = !document.body.classList.contains('dark-mode');
    document.body.classList.toggle('dark-mode', dark);
    try {
      localStorage.setItem('olopsc_clearance_theme', dark ? 'dark' : 'light');
    } catch {
      showToast('Your theme changed, but the preference could not be saved.', 'info');
    }
  }));
  const sidebar = document.getElementById('sidebar');
  const overlay = document.querySelector('[data-mobile-overlay]');
  const closeMenu = () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('visible');
    document.querySelector('[data-menu-toggle]')?.setAttribute('aria-expanded', 'false');
  };
  document.querySelectorAll('[data-menu-toggle]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      const isOpen = sidebar ? !sidebar.classList.contains('open') : false;
      sidebar?.classList.toggle('open', isOpen);
      overlay?.classList.toggle('visible', isOpen);
      button.setAttribute('aria-expanded', String(isOpen));
    });
  });
  overlay?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar?.classList.contains('open')) closeMenu();
  });
  document.querySelectorAll('[data-print]').forEach((button) => button.addEventListener('click', () => window.print()));
}

initShell();
