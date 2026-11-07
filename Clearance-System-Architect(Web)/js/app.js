import { getProfile } from './clearance-data.js';
import { getSupabaseClient, friendlyError } from './supabase-client.js';
import { showToast } from './toast.js';

export const DEPARTMENTS = [
  { id: 'library', name: 'Library', icon: '▤', requirement: 'Return all borrowed books and settle any outstanding library fees.' },
  { id: 'accounting', name: 'Accounting', icon: '＄', requirement: 'Settle outstanding tuition, fees, or payment arrangements.' },
  { id: 'laboratory', name: 'Laboratory', icon: '⚗', requirement: 'Return borrowed equipment and settle laboratory charges.' },
  { id: 'registrar', name: 'Registrar', icon: '▣', requirement: 'Confirm academic records and submit any required forms.' },
  { id: 'student-affairs', name: 'Student Affairs', icon: '✳', requirement: 'Complete student organization and conduct requirements.' }
];

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
  const approved = DEPARTMENTS.filter((department) => getRequest(user, department.id).status === 'approved').length;
  return { approved, total: DEPARTMENTS.length, percent: Math.round((approved / DEPARTMENTS.length) * 100) };
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
}

export async function guardPage() {
  const requiredRole = document.body.dataset.requiresRole;
  try {
    const auth = getSupabaseClient().auth;
    const { data: { session }, error: sessionError } = await auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
      if (requiredRole) window.location.replace('login.html');
      return null;
    }

    const { data: { user }, error } = await auth.getUser(session.access_token);
    if (error) throw error;
    if (!user) {
      if (requiredRole) window.location.replace('login.html');
      return null;
    }

    const profile = await getProfile(user.id);
    applyUser(profile);
    const role = profile.role.toLowerCase();
    if (requiredRole && role !== requiredRole) {
      window.location.replace(role === 'admin' ? 'admin-dashboard.html' : 'student-dashboard.html');
      return null;
    }
    if (!requiredRole && window.location.pathname.endsWith('login.html')) {
      window.location.replace(role === 'admin' ? 'admin-dashboard.html' : 'student-dashboard.html');
      return null;
    }
    return toAppUser(profile);
  } catch (error) {
    showToast(friendlyError(error, 'We could not verify your account. Please sign in again.'), 'error');
    if (requiredRole) window.location.replace('login.html');
    return null;
  }
}

async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) {
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
  document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', signOut));
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
