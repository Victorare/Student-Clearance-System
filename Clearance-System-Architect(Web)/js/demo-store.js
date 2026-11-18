import { DEPARTMENTS } from './departments.js';
import { canReviewDepartment } from './roles.js';

const SESSION_KEY = 'olopsc_clearance_demo_session';
const REQUESTS_KEY = 'olopsc_clearance_demo_requests';
const AUDIT_KEY = 'olopsc_clearance_demo_audit';
const STUDENTS_KEY = 'olopsc_clearance_demo_students';
const REQUEST_SEED_MIGRATION_KEY = 'olopsc_clearance_demo_pending_seed_v1';
const REQUEST_DEPARTMENT_SEED_KEY = 'olopsc_clearance_demo_department_seed_v2';

const accounts = [
  {
    id: 'demo-student',
    email: 'test.student@olopsc.edu.ph',
    password: 'StudentDemo!2026-OLOPSC',
    role: 'student',
    full_name: 'Ethan Navarro',
    student_id: 'DEV-STUDENT-0001',
    program: 'BSCS',
    academic_year: '2026-2027',
    borrowedBooksCount: 0
  },
  {
    id: 'demo-student-2',
    email: 'student.two@olopsc.edu.ph',
    password: 'StudentTwoDemo!2026-OLOPSC',
    role: 'student',
    full_name: 'Alyssa Reyes',
    student_id: 'DEV-STUDENT-0002',
    program: 'BSCS',
    academic_year: '2026-2027',
    borrowedBooksCount: 0
  },
  {
    id: 'demo-student-3',
    email: 'student.three@olopsc.edu.ph',
    password: 'StudentThreeDemo!2026-OLOPSC',
    role: 'student',
    full_name: 'Marco Santos',
    student_id: 'DEV-STUDENT-0003',
    program: 'BSCS',
    academic_year: '2026-2027',
    borrowedBooksCount: 0
  },
  { id: 'demo-dean', email: 'dean@olopsc.edu.ph', password: 'DeanDemo!2026-OLOPSC', role: 'admin-dean', full_name: 'Development Dean' },
  { id: 'demo-registrar', email: 'registrar@olopsc.edu.ph', password: 'RegistrarDemo!2026-OLOPSC', role: 'registrar', full_name: 'Development Registrar' },
  { id: 'demo-clinic', email: 'clinic@olopsc.edu.ph', password: 'ClinicDemo!2026-OLOPSC', role: 'clinic', full_name: 'Development Clinic Staff' },
  { id: 'demo-library', email: 'library@olopsc.edu.ph', password: 'LibraryDemo!2026-OLOPSC', role: 'library', full_name: 'Development Librarian' },
  { id: 'demo-guidance', email: 'guidance@olopsc.edu.ph', password: 'GuidanceDemo!2026-OLOPSC', role: 'guidance', full_name: 'Development Guidance Staff' },
  { id: 'demo-accounting', email: 'accounting@olopsc.edu.ph', password: 'AccountingDemo!2026-OLOPSC', role: 'accounting', full_name: 'Development Accounting Staff' },
  { id: 'demo-faculty', email: 'faculty@olopsc.edu.ph', password: 'FacultyDemo!2026-OLOPSC', role: 'faculty', full_name: 'Development Faculty Member' }
];

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
  const demoStudent = accounts.find((account) => account.id === 'demo-student');
  return DEPARTMENTS.map((department) => ({
    request_id: 'demo-request-' + department.id,
    student_user_id: 'demo-student',
    student_name: demoStudent.full_name,
    student_id: demoStudent.student_id,
    department_id: department.id,
    department_name: department.name,
    status: 'pending',
    submitted_at: now,
    note: '',
    admin_note: '',
    reviewed_at: null,
    reviewed_by: null
  }));
}

function readRequests() {
  let requests = readStorage(REQUESTS_KEY, null);
  if (requests === null) {
    requests = seededRequests();
    writeStorage(REQUESTS_KEY, requests);
    writeStorage(REQUEST_SEED_MIGRATION_KEY, 'complete');
    writeStorage(REQUEST_DEPARTMENT_SEED_KEY, 'complete');
    return requests;
  }

  if (readStorage(REQUEST_SEED_MIGRATION_KEY, null) !== 'complete') {
    const seededIds = new Set(['demo-request-library', 'demo-request-accounting', 'demo-request-clinic']);
    requests = requests.map((request) => seededIds.has(request.request_id)
      ? { ...request, status: 'pending', admin_note: '', reviewed_at: null, reviewed_by: null }
      : request);
    writeStorage(REQUESTS_KEY, requests);
    writeStorage(REQUEST_SEED_MIGRATION_KEY, 'complete');
  }

  if (readStorage(REQUEST_DEPARTMENT_SEED_KEY, null) !== 'complete') {
    const existingDepartments = new Set(requests
      .filter((request) => request.student_user_id === 'demo-student')
      .map((request) => request.department_id));
    const missingRequests = seededRequests().filter((request) => !existingDepartments.has(request.department_id));
    requests = requests.concat(missingRequests);
    writeStorage(REQUESTS_KEY, requests);
    writeStorage(REQUEST_DEPARTMENT_SEED_KEY, 'complete');
  }

  const studentAccounts = new Map(accounts
    .filter((account) => account.role === 'student')
    .map((account) => [account.id, account]));
  let namesChanged = false;
  requests = requests.map((request) => {
    const student = studentAccounts.get(request.student_user_id);
    if (!student || (request.student_name === student.full_name && request.student_id === student.student_id)) return request;
    namesChanged = true;
    return { ...request, student_name: student.full_name, student_id: student.student_id };
  });
  if (namesChanged) writeStorage(REQUESTS_KEY, requests);
  return requests;
}

function readAudit() {
  const audit = readStorage(AUDIT_KEY, []);
  const studentAccounts = new Map(accounts
    .filter((account) => account.role === 'student')
    .map((account) => [account.student_id, account]));
  let namesChanged = false;
  const normalizedAudit = audit.map((entry) => {
    const student = studentAccounts.get(entry.student_id);
    if (!student) return entry;
    const updatedEntry = { ...entry };
    if (updatedEntry.target_student !== student.full_name) {
      updatedEntry.target_student = student.full_name;
      namesChanged = true;
    }
    if (updatedEntry.actor_username === 'Development Test Student') {
      updatedEntry.actor_username = student.full_name;
      namesChanged = true;
    }
    return updatedEntry;
  });
  if (namesChanged) writeStorage(AUDIT_KEY, normalizedAudit);
  return normalizedAudit;
}

function readStudents() {
  const savedStudents = readStorage(STUDENTS_KEY, null);
  const students = savedStudents === null ? [] : savedStudents;
  if (!Array.isArray(students)) throw new UserFacingError('The saved student records are invalid. Clear the demo data and reload.');

  let changed = savedStudents === null;
  const studentAccounts = new Map(accounts
    .filter((account) => account.role === 'student')
    .map((account) => [account.id, account]));
  const normalizedStudents = students.map((student) => {
    const account = studentAccounts.get(student.id);
    const normalizedStudent = { ...student };
    if (account) {
      ['email', 'full_name', 'student_id', 'program', 'academic_year'].forEach((field) => {
        if (normalizedStudent[field] !== account[field]) changed = true;
        normalizedStudent[field] = account[field];
      });
    }
    if (!Number.isInteger(student.borrowedBooksCount) || student.borrowedBooksCount < 0) {
      changed = true;
      normalizedStudent.borrowedBooksCount = 0;
    }
    return normalizedStudent;
  });
  const savedIds = new Set(normalizedStudents.map((student) => student.id));
  accounts.filter((account) => account.role === 'student').forEach((account) => {
    if (savedIds.has(account.id)) return;
    normalizedStudents.push({
      id: account.id,
      email: account.email,
      full_name: account.full_name,
      student_id: account.student_id,
      program: account.program,
      academic_year: account.academic_year,
      borrowedBooksCount: 0
    });
    savedIds.add(account.id);
    changed = true;
  });
  if (changed) writeStorage(STUDENTS_KEY, normalizedStudents);
  return normalizedStudents;
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
  return readRequests().filter((request) => canReviewDepartment(profile.role, request.department_id));
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

export function getStudentRecord() {
  const profile = requireProfile();
  if (profile.role !== 'student') throw new UserFacingError('Only student accounts can view student records.');
  const student = readStudents().find((item) => item.id === profile.id);
  if (!student) throw new UserFacingError('The student record could not be found.');
  return { borrowedBooksCount: student.borrowedBooksCount };
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
  return readStudents().length;
}

export function getAdminStudents() {
  const profile = requireStaff();
  if (profile.role !== 'library') throw new UserFacingError('Only Library staff can manage borrowed book counts.');
  return readStudents().map(({ id, full_name, student_id, borrowedBooksCount }) => ({
    id,
    full_name,
    student_id,
    borrowedBooksCount
  }));
}

export function updateBorrowedBooksCount({ studentId, count }) {
  const profile = requireStaff();
  if (profile.role !== 'library') throw new UserFacingError('Only Library staff can manage borrowed book counts.');
  if (!Number.isInteger(count) || count < 0) {
    throw new UserFacingError('Enter a non-negative whole number of borrowed books.');
  }
  const students = readStudents();
  const student = students.find((item) => item.id === studentId);
  if (!student) throw new UserFacingError('The student record could not be found.');
  student.borrowedBooksCount = count;
  writeStorage(STUDENTS_KEY, students);
  return { ...student };
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
  const normalizedAction = action.toLowerCase();
  if (!['approved', 'rejected', 'revoke'].includes(normalizedAction)) {
    throw new UserFacingError('Choose a valid decision.');
  }
  const request = readRequests().find((item) => item.request_id === requestId);
  const expectedStatus = normalizedAction === 'revoke' ? 'approved' : 'pending';
  if (!request || request.status !== expectedStatus) {
    throw new UserFacingError(normalizedAction === 'revoke'
      ? 'This request is not approved or no longer exists.'
      : 'This request is not pending or no longer exists.');
  }
  if (!canReviewDepartment(profile.role, request.department_id)) {
    throw new UserFacingError('You may only review requests for your department.');
  }
  if (normalizedAction === 'rejected' && !feedbackNotes.trim()) {
    throw new UserFacingError('Choose a valid decision and provide feedback when rejecting.');
  }

  const revoked = normalizedAction === 'revoke';
  request.status = revoked ? 'pending' : normalizedAction;
  request.admin_note = revoked ? '' : feedbackNotes;
  request.reviewed_at = revoked ? null : new Date().toISOString();
  request.reviewed_by = revoked ? null : profile.full_name;
  writeStorage(REQUESTS_KEY, readRequests().map((item) => item.request_id === requestId ? request : item));
  saveAudit({
    action: revoked ? 'clearance_approval_revoked' : 'clearance_reviewed',
    action_status: revoked ? 'Approval revoked' : normalizedAction,
    details: revoked ? 'Request returned to pending review.' : feedbackNotes,
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
