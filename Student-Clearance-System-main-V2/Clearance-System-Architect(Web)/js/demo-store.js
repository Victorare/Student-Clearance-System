import { DEPARTMENTS } from './departments.js';

const SESSION_KEY = 'olopsc_clearance_demo_session';
const REQUESTS_KEY = 'olopsc_clearance_demo_requests';
const AUDIT_KEY = 'olopsc_clearance_demo_audit';

const accounts = [
  {
    id: 'demo-student',
    email: 'test.student@olopsc.edu.ph',
    password: 'StudentDemo!2026-OLOPSC',
    role: 'student',
    full_name: 'Development Test Student',
    student_id: 'DEV-STUDENT-0001',
    program: 'Development Program',
    academic_year: '2026-2027'
  },
  { id: 'demo-dean', email: 'dean@olopsc.edu.ph', password: 'DeanDemo!2026-OLOPSC', role: 'admin-dean', full_name: 'Development Dean' },
  { id: 'demo-registrar', email: 'registrar@olopsc.edu.ph', password: 'RegistrarDemo!2026-OLOPSC', role: 'registrar', full_name: 'Development Registrar' },
  { id: 'demo-clinic', email: 'clinic@olopsc.edu.ph', password: 'ClinicDemo!2026-OLOPSC', role: 'clinic', full_name: 'Development Clinic Staff' },
  { id: 'demo-library', email: 'library@olopsc.edu.ph', password: 'LibraryDemo!2026-OLOPSC', role: 'library', full_name: 'Development Librarian' },
  { id: 'demo-guidance', email: 'guidance@olopsc.edu.ph', password: 'GuidanceDemo!2026-OLOPSC', role: 'guidance', full_name: 'Development Guidance Staff' },
  { id: 'demo-accounting', email: 'accounting@olopsc.edu.ph', password: 'AccountingDemo!2026-OLOPSC', role: 'accounting', full_name: 'Development Accounting Staff' },
  { id: 'demo-faculty', email: 'faculty@olopsc.edu.ph', password: 'FacultyDemo!2026-OLOPSC', role: 'faculty', full_name: 'Development Faculty Member' }
];

const departmentByRole = {
  registrar: 'registrar',
  clinic: 'clinic',
  library: 'library',
  guidance: 'guidance',
  accounting: 'accounting',
  faculty: 'faculty'
};

export class UserFacingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserFacingError';
  }
}

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    throw new UserFacingError('This browser could not read the saved demo data. Enable local storage and reload.');
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new UserFacingError('This browser could not save demo data. Check available storage and try again.');
  }
}

function publicAccount(account) {
  if (!account) return null;
  const { password, ...profile } = account;
  return profile;
}

function currentProfile() {
  const email = readStorage(SESSION_KEY, null);
  return publicAccount(accounts.find((account) => account.email === email));
}

function requireProfile() {
  const profile = currentProfile();
  if (!profile) throw new UserFacingError('Sign in is required.');
  return profile;
}

function seededRequests() {
  const now = new Date().toISOString();
  return [
    { request_id: 'demo-request-library', student_user_id: 'demo-student', student_name: 'Development Test Student', student_id: 'DEV-STUDENT-0001', department_id: 'library', department_name: 'Library', status: 'approved', submitted_at: now, note: '', admin_note: '', reviewed_at: now, reviewed_by: 'Development Librarian' },
    { request_id: 'demo-request-accounting', student_user_id: 'demo-student', student_name: 'Development Test Student', student_id: 'DEV-STUDENT-0001', department_id: 'accounting', department_name: 'Accounting', status: 'pending', submitted_at: now, note: '', admin_note: '', reviewed_at: null, reviewed_by: null },
    { request_id: 'demo-request-clinic', student_user_id: 'demo-student', student_name: 'Development Test Student', student_id: 'DEV-STUDENT-0001', department_id: 'clinic', department_name: 'Clinic', status: 'rejected', submitted_at: now, note: '', admin_note: 'Please complete the required health clearance.', reviewed_at: now, reviewed_by: 'Development Clinic Staff' }
  ];
}

function readRequests() {
  const requests = readStorage(REQUESTS_KEY, null);
  if (requests) return requests;
  const initial = seededRequests();
  writeStorage(REQUESTS_KEY, initial);
  return initial;
}

function readAudit() {
  return readStorage(AUDIT_KEY, []);
}

function saveAudit(entry) {
  const audit = readAudit();
  audit.unshift({ ...entry, audit_id: createId(), occurred_at: new Date().toISOString() });
  writeStorage(AUDIT_KEY, audit);
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function visibleRequests(profile) {
  const departmentId = profile.role === 'registrar' ? null : departmentByRole[profile.role] || null;
  return readRequests().filter((request) => !departmentId || request.department_id === departmentId);
}

export function signIn(email, password) {
  const account = accounts.find((item) => item.email === email.trim().toLowerCase() && item.password === password);
  if (!account) throw new UserFacingError('We could not sign you in. Check your details and try again.');
  writeStorage(SESSION_KEY, account.email);
  return publicAccount(account);
}

export function signOut() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    throw new UserFacingError('This browser could not clear the demo session. Please clear site data and try again.');
  }
}

export function getProfile() {
  return currentProfile();
}

export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  return error instanceof UserFacingError ? error.message : fallback;
}

export function getDepartments() {
  return DEPARTMENTS.map(({ id, name, requirement }) => ({
    department_id: id,
    name,
    requirement
  }));
}

export function getStudentClearance() {
  const profile = requireProfile();
  if (profile.role !== 'student') throw new UserFacingError('Only student accounts can view student clearance.');
  return readRequests()
    .filter((request) => request.student_user_id === profile.id)
    .map((request) => ({
      ...request,
      submission_timestamp: request.submitted_at,
      feedback_notes: request.admin_note || request.note
    }));
}

export function submitClearanceRequest({ departmentId, feedbackNotes }) {
  const profile = requireProfile();
  if (profile.role !== 'student') throw new UserFacingError('Only student accounts can submit clearance requests.');
  const department = DEPARTMENTS.find((item) => item.id === departmentId);
  if (!department) throw new UserFacingError('The selected department was not found.');

  const requests = readRequests();
  const existing = requests.find((request) =>
    request.student_user_id === profile.id && request.department_id === departmentId
  );
  if (existing && existing.status !== 'rejected') {
    throw new UserFacingError('A request for this department is already pending or approved.');
  }

  const now = new Date().toISOString();
  const request = {
    request_id: existing?.request_id || createId(),
    student_user_id: profile.id,
    student_name: profile.full_name,
    student_id: profile.student_id,
    department_id: department.id,
    department_name: department.name,
    status: 'pending',
    submitted_at: now,
    note: feedbackNotes,
    admin_note: '',
    reviewed_at: null,
    reviewed_by: null
  };
  if (existing) requests[requests.indexOf(existing)] = request;
  else requests.push(request);
  writeStorage(REQUESTS_KEY, requests);
  saveAudit({
    action: 'clearance_submitted',
    action_status: 'pending',
    details: feedbackNotes,
    actor_username: profile.full_name,
    target_student: profile.full_name,
    student_id: profile.student_id,
    department_name: department.name
  });
  return request;
}

export function getAdminRequests() {
  const profile = requireProfile();
  if (profile.role === 'student') throw new UserFacingError('A staff account is required.');
  return visibleRequests(profile).map((request) => ({
    ...request,
    submission_timestamp: request.submitted_at,
    feedback_notes: request.admin_note || request.note,
    student: { full_name: request.student_name, student_id: request.student_id },
    department: { name: request.department_name }
  }));
}

export function getAdminStudentCount() {
  requireStaff();
  return accounts.filter((account) => account.role === 'student').length;
}

export function getAdminStatusCounts() {
  const requests = visibleRequests(requireStaff());
  return {
    Pending: requests.filter((request) => request.status === 'pending').length,
    Approved: requests.filter((request) => request.status === 'approved').length,
    Rejected: requests.filter((request) => request.status === 'rejected').length
  };
}

export function reviewClearanceRequest({ requestId, action, feedbackNotes = '' }) {
  const profile = requireStaff();
  const request = readRequests().find((item) => item.request_id === requestId);
  if (!request || request.status !== 'pending') {
    throw new UserFacingError('This request is not pending or no longer exists.');
  }
  const permittedDepartment = departmentByRole[profile.role];
  if (permittedDepartment && request.department_id !== permittedDepartment) {
    throw new UserFacingError('You may only review requests for your department.');
  }
  const status = action.toLowerCase();
  if (!['approved', 'rejected'].includes(status) || (status === 'rejected' && !feedbackNotes.trim())) {
    throw new UserFacingError('Choose a valid decision and provide feedback when rejecting.');
  }

  request.status = status;
  request.admin_note = feedbackNotes;
  request.reviewed_at = new Date().toISOString();
  request.reviewed_by = profile.full_name;
  writeStorage(REQUESTS_KEY, readRequests().map((item) => item.request_id === requestId ? request : item));
  saveAudit({
    action: 'clearance_reviewed',
    action_status: status,
    details: feedbackNotes,
    actor_username: profile.full_name,
    target_student: request.student_name,
    student_id: request.student_id,
    department_name: request.department_name
  });
  return request;
}

export function getAuditLogs() {
  const profile = requireStaff();
  if (!['admin', 'admin-dean'].includes(profile.role)) {
    throw new UserFacingError('Audit logs are available to Admin and Admin - Dean accounts only.');
  }
  return readAudit().map((entry) => ({
    ...entry,
    action: entry.action_status,
    feedback_notes_snapshot: entry.details,
    actor: { full_name: entry.actor_username },
    target: { full_name: entry.target_student, student_id: entry.student_id },
    department: { name: entry.department_name }
  }));
}

function requireStaff() {
  const profile = requireProfile();
  if (profile.role === 'student') throw new UserFacingError('A staff account is required.');
  return profile;
}
