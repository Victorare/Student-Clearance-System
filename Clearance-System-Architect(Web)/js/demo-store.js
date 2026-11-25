import { DEPARTMENTS } from './departments.js';
import { canManageDepartmentRequirements, canReviewDepartment } from './roles.js?v=olopsc-v9';

const SESSION_KEY = 'olopsc_clearance_demo_session';
const REQUESTS_KEY = 'olopsc_clearance_demo_requests';
const AUDIT_KEY = 'olopsc_clearance_demo_audit';
const STUDENTS_KEY = 'olopsc_clearance_demo_students';
const LIBRARY_RECORDS_KEY = 'olopsc_clearance_demo_library_records';
const USERS_KEY = 'olopsc_clearance_demo_users';
const DEPARTMENTS_KEY = 'olopsc_clearance_demo_departments';
const REQUIREMENTS_KEY = 'olopsc_clearance_demo_requirements';
const NOTIFICATIONS_KEY = 'olopsc_clearance_demo_notifications';
const REQUEST_SEED_MIGRATION_KEY = 'olopsc_clearance_demo_pending_seed_v1';
const REQUEST_DEPARTMENT_SEED_KEY = 'olopsc_clearance_demo_department_seed_v2';
const REQUEST_DEAN_SEED_KEY = 'olopsc_clearance_demo_dean_seed_v3';
const REQUEST_NOT_SUBMITTED_SEED_KEY = 'olopsc_clearance_demo_not_submitted_seed_v4';

const DEFAULT_REQUIREMENTS = Object.freeze({
  library: ['Return all borrowed books', 'Pay all outstanding fines'],
  accounting: ['Settle remaining balance', 'Submit official receipt'],
  registrar: ['Complete enrollment records'],
  'student-affairs': ['Complete student organization requirements', 'Resolve any conduct matters'],
  clinic: ['Complete required health examination', 'Submit required immunization records'],
  guidance: ['Complete guidance clearance', 'Complete the exit interview'],
  faculty: ['Complete assigned academic requirements'],
  dean: ['Resolve academic holds', 'Complete any incomplete grade requirements']
});

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
    year_level: '4th Year',
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
    year_level: '2nd Year',
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
    year_level: '2nd Year',
    borrowedBooksCount: 0
  },
  { id: 'demo-dean', email: 'dean@olopsc.edu.ph', password: 'DeanDemo!2026-OLOPSC', role: 'dean', full_name: 'Development Dean' },
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
  let value;
  try {
    value = localStorage.getItem(key);
  } catch {
    throw new UserFacingError('This browser could not read the saved demo data. Enable local storage and reload.');
  }
  if (value === null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      throw new UserFacingError('Corrupted demo data could not be recovered. Clear this site’s local storage and reload.');
    }
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new UserFacingError('This browser could not save demo data. Check available storage and try again.');
  }
  if (key === NOTIFICATIONS_KEY) {
    window.dispatchEvent(new CustomEvent('olopsc:notifications-updated'));
  }
}

function readUsers() {
  const saved = readStorage(USERS_KEY, null);
  if (Array.isArray(saved) && saved.length === accounts.length) return saved;
  const users = accounts.map(({ password, ...user }) => user);
  writeStorage(USERS_KEY, users);
  return users;
}

function readDepartments() {
  const saved = readStorage(DEPARTMENTS_KEY, null);
  if (Array.isArray(saved)) {
    const savedById = new Map(saved.filter((item) => item && typeof item.id === 'string').map((item) => [item.id, item]));
    const departments = DEPARTMENTS.map((department) => ({
      id: department.id,
      name: typeof savedById.get(department.id)?.name === 'string' ? savedById.get(department.id).name : department.name,
      icon: typeof savedById.get(department.id)?.icon === 'string' ? savedById.get(department.id).icon : department.icon
    }));
    if (JSON.stringify(saved) !== JSON.stringify(departments)) writeStorage(DEPARTMENTS_KEY, departments);
    return departments;
  }
  const departments = DEPARTMENTS.map(({ id, name, icon }) => ({ id, name, icon }));
  writeStorage(DEPARTMENTS_KEY, departments);
  return departments;
}

function readRequirements() {
  const saved = readStorage(REQUIREMENTS_KEY, null);
  const requirements = {};
  DEPARTMENTS.forEach(({ id }) => {
    const source = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved[id] : null;
    const items = Array.isArray(source)
      ? source.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : [];
    requirements[id] = items.length ? items : [...(DEFAULT_REQUIREMENTS[id] || [])];
  });
  if (saved === null || JSON.stringify(saved) !== JSON.stringify(requirements)) {
    writeStorage(REQUIREMENTS_KEY, requirements);
  }
  return requirements;
}

function readNotifications() {
  const saved = readStorage(NOTIFICATIONS_KEY, null);
  if (saved === null) {
    writeStorage(NOTIFICATIONS_KEY, []);
    return [];
  }
  if (!Array.isArray(saved)) {
    writeStorage(NOTIFICATIONS_KEY, []);
    return [];
  }
  const notifications = saved.filter((item) =>
    item && typeof item === 'object' && typeof item.student_user_id === 'string' &&
    typeof item.message === 'string'
  );
  if (notifications.length !== saved.length) writeStorage(NOTIFICATIONS_KEY, notifications);
  return notifications;
}

function initializeCollections() {
  readUsers();
  readDepartments();
  readRequirements();
  readNotifications();
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
    status: 'not-submitted',
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
    writeStorage(REQUEST_DEAN_SEED_KEY, 'complete');
    writeStorage(REQUEST_NOT_SUBMITTED_SEED_KEY, 'complete');
    return requests;
  }
  if (!Array.isArray(requests)) {
    requests = seededRequests();
    writeStorage(REQUESTS_KEY, requests);
    writeStorage(REQUEST_SEED_MIGRATION_KEY, 'complete');
    writeStorage(REQUEST_DEPARTMENT_SEED_KEY, 'complete');
    writeStorage(REQUEST_DEAN_SEED_KEY, 'complete');
    writeStorage(REQUEST_NOT_SUBMITTED_SEED_KEY, 'complete');
    return requests;
  }
  requests = requests.filter((request) => request && typeof request === 'object' && !Array.isArray(request));

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

  if (readStorage(REQUEST_DEAN_SEED_KEY, null) !== 'complete') {
    const deanRequest = seededRequests().filter((request) => request.department_id === 'dean');
    const existing = new Set(requests.map((request) => `${request.student_user_id}:${request.department_id}`));
    requests = requests.concat(deanRequest.filter((request) => !existing.has(`${request.student_user_id}:${request.department_id}`)));
    writeStorage(REQUESTS_KEY, requests);
    writeStorage(REQUEST_DEAN_SEED_KEY, 'complete');
  }

  if (readStorage(REQUEST_NOT_SUBMITTED_SEED_KEY, null) !== 'complete') {
    let seedStateChanged = false;
    requests = requests.map((request) => {
      if (String(request.request_id || '').startsWith('demo-request-') &&
          request.status === 'pending' &&
          !request.note &&
          !request.admin_note &&
          !Array.isArray(request.completed_requirements) &&
          !request.reviewed_at &&
          !request.reviewed_by) {
        seedStateChanged = true;
        return { ...request, status: 'not-submitted', submitted_at: null };
      }
      return request;
    });
    if (seedStateChanged) writeStorage(REQUESTS_KEY, requests);
    writeStorage(REQUEST_NOT_SUBMITTED_SEED_KEY, 'complete');
  }

  if (!Array.isArray(requests)) {
    requests = seededRequests();
    writeStorage(REQUESTS_KEY, requests);
  }
  const validStatuses = new Set(['not-submitted', 'pending', 'approved', 'rejected']);
  const validStudents = new Set(accounts.filter((account) => account.role === 'student').map((account) => account.id));
  const validDepartments = new Set(DEPARTMENTS.map((department) => department.id));
  const uniqueRequests = new Map();
  requests.forEach((request) => {
    if (!request || !validStudents.has(request.student_user_id) ||
        !validDepartments.has(request.department_id) || !validStatuses.has(request.status)) return;
    uniqueRequests.set(`${request.student_user_id}:${request.department_id}`, request);
  });
  if (uniqueRequests.size !== requests.length) {
    requests = [...uniqueRequests.values()];
    writeStorage(REQUESTS_KEY, requests);
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
  if (!Array.isArray(audit)) {
    writeStorage(AUDIT_KEY, []);
    return [];
  }
  const normalizedAudit = audit
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => {
      const id = entry.id || entry.audit_id || createId();
      const actor = entry.actor || entry.actor_username || 'Staff';
      const actorAccount = accounts.find((account) => account.full_name === actor);
      const actionCode = entry.action_code || (entry.action_status ? entry.action : '');
      const staffAuthentication = ['login', 'logout'].includes(actionCode) && actorAccount?.role !== 'student';
      return {
        ...entry,
        id,
        audit_id: entry.audit_id || id,
        actor,
        actorRole: entry.actorRole || entry.actor_role || roleLabel(actorAccount?.role),
        student: staffAuthentication ? '' : entry.student || entry.target_student || '',
        studentID: staffAuthentication ? '' : entry.studentID || entry.student_id || '',
        department: entry.department || entry.department_name || '',
        action: entry.action_status || entry.action || 'Activity recorded',
        action_code: actionCode,
        reason: entry.reason ?? entry.details ?? '',
        timestamp: entry.timestamp || entry.occurred_at || new Date().toISOString()
      };
    });
  if (normalizedAudit.length !== audit.length ||
      normalizedAudit.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(audit[index]))) {
    writeStorage(AUDIT_KEY, normalizedAudit);
  }
  return normalizedAudit;
}

function readStudents() {
  const savedStudents = readStorage(STUDENTS_KEY, null);
  const students = savedStudents === null || !Array.isArray(savedStudents) ? [] : savedStudents;

  let changed = savedStudents === null || !Array.isArray(savedStudents) || students.length !== (savedStudents || []).length;
  const studentAccounts = new Map(accounts
    .filter((account) => account.role === 'student')
    .map((account) => [account.id, account]));
  const normalizedStudents = students.filter((student) => student && typeof student === 'object' && typeof student.id === 'string').map((student) => {
    const account = studentAccounts.get(student.id);
    const normalizedStudent = { ...student };
    if (account) {
      ['email', 'full_name', 'student_id', 'program', 'academic_year', 'year_level'].forEach((field) => {
        if (normalizedStudent[field] !== account[field]) changed = true;
        normalizedStudent[field] = account[field];
      });
    }
    return normalizedStudent;
  });
  const savedIds = new Set(normalizedStudents.map((student) => student.id));
  if (savedIds.size !== normalizedStudents.length) {
    changed = true;
    const uniqueStudents = new Map(normalizedStudents.map((student) => [student.id, student]));
    normalizedStudents.splice(0, normalizedStudents.length, ...uniqueStudents.values());
    savedIds.clear();
    normalizedStudents.forEach((student) => savedIds.add(student.id));
  }
  accounts.filter((account) => account.role === 'student').forEach((account) => {
    if (savedIds.has(account.id)) return;
    normalizedStudents.push({
      id: account.id,
      email: account.email,
      full_name: account.full_name,
      student_id: account.student_id,
      program: account.program,
      academic_year: account.academic_year,
      year_level: account.year_level,
      borrowedBooksCount: 0
    });
    savedIds.add(account.id);
    changed = true;
  });
  if (!Array.isArray(readStorage(LIBRARY_RECORDS_KEY, null))) {
    writeStorage(LIBRARY_RECORDS_KEY, normalizedStudents.map((student) => ({
      student_user_id: student.id,
      student_id: student.student_id,
      borrowedBooksCount: student.borrowedBooksCount
    })));
  }
  const profiles = normalizedStudents.map((student) => {
    const { borrowedBooksCount, ...profile } = student;
    return profile;
  });
  if (changed || JSON.stringify(profiles) !== JSON.stringify(students)) writeStorage(STUDENTS_KEY, profiles);
  return profiles;
}

function readLibraryRecords() {
  const students = readStudents();
  const savedRecords = readStorage(LIBRARY_RECORDS_KEY, []);
  const records = Array.isArray(savedRecords) ? savedRecords : [];
  const byStudent = new Map(records
    .filter((record) => record && typeof record.student_user_id === 'string')
    .map((record) => [record.student_user_id, record]));
  let changed = !Array.isArray(savedRecords) || records.length !== savedRecords.length;
  const normalized = students.map((student) => {
    const record = byStudent.get(student.id);
    const borrowedBooksCount = record?.borrowedBooksCount;
    const count = Number.isSafeInteger(borrowedBooksCount) && borrowedBooksCount >= 0 ? borrowedBooksCount : 0;
    if (!record || record.student_id !== student.student_id || borrowedBooksCount !== count) changed = true;
    return {
      student_user_id: student.id,
      student_id: student.student_id,
      borrowedBooksCount: count
    };
  });
  if (changed || JSON.stringify(normalized) !== JSON.stringify(records)) writeStorage(LIBRARY_RECORDS_KEY, normalized);
  return normalized;
}

function saveAudit(entry) {
  const audit = readAudit();
  const id = createId();
  const timestamp = new Date().toISOString();
  const record = {
    ...entry,
    id,
    audit_id: id,
    actor: entry.actor || entry.actor_username || 'Staff',
    actorRole: entry.actorRole || entry.actor_role || 'Staff',
    student: entry.student || entry.target_student || '',
    studentID: entry.studentID || entry.student_id || '',
    department: entry.department || entry.department_name || '',
    action: entry.action_status || entry.action || 'Activity recorded',
    action_code: entry.action_code || entry.action || '',
    reason: entry.reason ?? entry.details ?? '',
    timestamp,
    occurred_at: timestamp
  };
  audit.unshift(record);
  writeStorage(AUDIT_KEY, audit);
}

function saveNotification(request, type, reason = '', message = '') {
  const department = DEPARTMENTS.find((item) => item.id === request.department_id);
  const departmentName = department?.name || request.department_name || request.department_id;
  const notification = {
    id: createId(),
    student_user_id: request.student_user_id,
    student: request.student_name,
    student_id: request.student_id,
    department_id: request.department_id,
    department: departmentName,
    type,
    message: message || (type === 'approved'
      ? `${departmentName} approved your clearance request.`
      : reason || `${departmentName} requested changes to your clearance request.`),
    reason,
    read: false,
    date: new Date().toISOString()
  };
  const notifications = readNotifications();
  notifications.unshift(notification);
  writeStorage(NOTIFICATIONS_KEY, notifications);
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function roleLabel(role) {
  return ({
    student: 'Student',
    admin: 'Super Admin',
    'admin-dean': 'Dean Admin',
    dean: 'Dean',
    registrar: 'Registrar Admin',
    clinic: 'Clinic Admin',
    library: 'Library Admin',
    guidance: 'Guidance Admin',
    accounting: 'Accounting Admin',
    faculty: 'Faculty Admin'
  })[role] || 'Staff';
}

export function validateClearance(student, department) {
  const departmentId = typeof department === 'string' ? department : department?.id;
  const studentId = typeof student === 'string' ? student : student?.id;
  const studentRecord = readStudents().find((item) => item.id === studentId);
  if (!studentRecord) return { approved: false, reason: 'Student record could not be found.' };
  const request = readRequests().find((item) =>
    item.student_user_id === studentId && item.department_id === departmentId
  );
  if (!request || request.status !== 'pending') {
    return { approved: false, reason: 'A pending clearance request could not be found.' };
  }

  if (departmentId === 'library') {
    const libraryRecord = readLibraryRecords().find((item) => item.student_user_id === studentId);
    if (!libraryRecord) return { approved: false, reason: 'Library records could not be found.' };
    if (libraryRecord.borrowedBooksCount > 0) {
      return {
        approved: false,
        reason: 'Student still has borrowed books. Return all borrowed books before approval.'
      };
    }
  }

  const requirements = readRequirements()[departmentId] || [];
  if (!requirements.length) return { approved: false, reason: 'No department requirements are configured.' };
  const completed = new Set(Array.isArray(request.completed_requirements) ? request.completed_requirements : []);
  const incomplete = requirements.find((requirement) => !completed.has(requirement));
  if (incomplete) return { approved: false, reason: `Incomplete requirement: ${incomplete}` };
  if (Array.isArray(request.pending_issues) && request.pending_issues.length) {
    return { approved: false, reason: `Unresolved issue: ${request.pending_issues[0]}` };
  }
  return { approved: true };
}

function visibleRequests(profile) {
  return readRequests().filter((request) =>
    request.status !== 'not-submitted' &&
    canReviewDepartment(profile.role, request.department_id)
  );
}

export function signIn(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new UserFacingError('Enter a valid school email and password.');
  }
  const account = accounts.find((item) => item.email === email.trim().toLowerCase() && item.password === password);
  if (!account) throw new UserFacingError('We could not sign you in. Check your details and try again.');
  initializeCollections();
  writeStorage(SESSION_KEY, account.email);
  try {
    saveAudit({
      action: 'login',
      action_status: 'Login',
      details: '',
      actor_username: account.full_name,
      actor_role: roleLabel(account.role),
      target_student: account.role === 'student' ? account.full_name : '',
      student_id: account.role === 'student' ? account.student_id : '',
      department_name: 'Authentication'
    });
  } catch (error) {
    signOut();
    throw error;
  }
  return publicAccount(account);
}

export function signOut() {
  const profile = currentProfile();
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    throw new UserFacingError('This browser could not clear the demo session. Please clear site data and try again.');
  }
  if (profile) {
    saveAudit({
      action: 'logout',
      action_status: 'Logout',
      details: '',
      actor_username: profile.full_name,
      actor_role: roleLabel(profile.role),
      target_student: profile.role === 'student' ? profile.full_name : '',
      student_id: profile.role === 'student' ? profile.student_id : '',
      department_name: 'Authentication'
    });
  }
}

export function getProfile() {
  initializeCollections();
  return currentProfile();
}

export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  return error instanceof UserFacingError ? error.message : fallback;
}

export function getDepartments() {
  const requirements = readRequirements();
  return readDepartments().map(({ id, name, icon }) => ({
    department_id: id,
    name,
    icon,
    requirements: [...requirements[id]],
    requirement: requirements[id].join(' ')
  }));
}

export function getDepartmentRequirements(departmentId) {
  const departments = readDepartments();
  if (!departments.some((department) => department.id === departmentId)) {
    throw new UserFacingError('The selected department was not found.');
  }
  return [...(readRequirements()[departmentId] || [])];
}

export function getRequirementsManagementData() {
  const profile = requireStaff();
  const departments = readDepartments();
  const permittedDepartments = profile.role === 'admin' || ['dean', 'admin-dean'].includes(profile.role)
    ? departments
    : departments.filter((department) => canManageDepartmentRequirements(profile.role, department.id));
  const requirements = readRequirements();
  return {
    departments: permittedDepartments.map((department) => ({
      ...department,
      canManage: canManageDepartmentRequirements(profile.role, department.id)
    })),
    requirements
  };
}

export function saveDepartmentRequirements(departmentId, items) {
  const profile = requireStaff();
  if (!canManageDepartmentRequirements(profile.role, departmentId)) {
    throw new UserFacingError('You may only manage requirements for your department.');
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 30 ||
      items.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > 250)) {
    throw new UserFacingError('Add between 1 and 30 requirements, each under 250 characters.');
  }
  const normalized = items.map((item) => item.trim());
  if (new Set(normalized.map((item) => item.toLocaleLowerCase())).size !== normalized.length) {
    throw new UserFacingError('Each requirement must be unique.');
  }
  const departments = readDepartments();
  const department = departments.find((item) => item.id === departmentId);
  if (!department) throw new UserFacingError('The selected department was not found.');
  const requirements = readRequirements();
  requirements[departmentId] = normalized;
  writeStorage(REQUIREMENTS_KEY, requirements);
  saveAudit({
    action: 'requirements_updated',
    action_status: 'Requirements updated',
    details: `${normalized.length} requirement${normalized.length === 1 ? '' : 's'} saved.`,
    actor_username: profile.full_name,
    actor_role: roleLabel(profile.role),
    target_student: '',
    student_id: '',
    department_name: department.name
  });
  return [...normalized];
}

export function getStudentNotifications() {
  const profile = requireProfile();
  if (profile.role !== 'student') throw new UserFacingError('Only student accounts can view notifications.');
  return readNotifications()
    .filter((notification) => notification.student_user_id === profile.id)
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

export function markStudentNotificationRead(notificationId) {
  const profile = requireProfile();
  if (profile.role !== 'student') throw new UserFacingError('Only student accounts can update notifications.');
  const notifications = readNotifications();
  const notification = notifications.find((item) => item.id === notificationId && item.student_user_id === profile.id);
  if (!notification) throw new UserFacingError('This notification could not be found.');
  notification.read = true;
  writeStorage(NOTIFICATIONS_KEY, notifications);
}

export function markAllStudentNotificationsRead() {
  const profile = requireProfile();
  if (profile.role !== 'student') throw new UserFacingError('Only student accounts can update notifications.');
  const notifications = readNotifications();
  notifications.forEach((notification) => {
    if (notification.student_user_id === profile.id) notification.read = true;
  });
  writeStorage(NOTIFICATIONS_KEY, notifications);
}

export function getAdminRecentActivity(limit = 6) {
  const profile = requireStaff();
  const canViewAll = ['admin', 'dean', 'admin-dean'].includes(profile.role);
  return readAudit()
    .filter((entry) =>
      (canViewAll || canReviewDepartment(profile.role, DEPARTMENTS.find((department) => department.name === entry.department)?.id)) &&
      ['clearance_reviewed', 'requirements_updated', 'library_approval_reopened', 'clearance_approval_blocked', 'library_books_updated'].includes(entry.action_code)
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => ({
      ...entry,
      actor: { full_name: entry.actor },
      target: { full_name: entry.student },
      department: { name: entry.department }
    }));
}

export function getStudentClearance() {
  const profile = requireProfile();
  if (profile.role !== 'student') throw new UserFacingError('Only student accounts can view student clearance.');
  const libraryRecord = readLibraryRecords().find((item) => item.student_user_id === profile.id);
  return readRequests()
    .filter((request) => request.student_user_id === profile.id)
    .map((request) => ({
      ...request,
      submission_timestamp: request.submitted_at,
      feedback_notes: request.admin_note || request.note,
      completed_requirements: Array.isArray(request.completed_requirements) ? request.completed_requirements : [],
      validation_reason: request.department_id === 'library' && request.status === 'pending' &&
        libraryRecord?.borrowedBooksCount > 0
        ? 'Student still has borrowed books. Return all borrowed books before approval.'
        : request.validation_reason || ''
    }));
}

export function getStudentRecord() {
  const profile = requireProfile();
  if (profile.role !== 'student') throw new UserFacingError('Only student accounts can view student records.');
  const record = readLibraryRecords().find((item) => item.student_user_id === profile.id);
  if (!record) throw new UserFacingError('The student library record could not be found.');
  return { borrowedBooksCount: record.borrowedBooksCount };
}

export function submitClearanceRequest({ departmentId, feedbackNotes, completedRequirements }) {
  const profile = requireProfile();
  if (profile.role !== 'student') throw new UserFacingError('Only student accounts can submit clearance requests.');
  if (typeof feedbackNotes !== 'string' || feedbackNotes.trim().length > 1000) {
    throw new UserFacingError('Keep your note under 1,000 characters.');
  }
  const department = DEPARTMENTS.find((item) => item.id === departmentId);
  if (!department) throw new UserFacingError('The selected department was not found.');
  const requirements = readRequirements()[departmentId] || [];
  if (!Array.isArray(completedRequirements) ||
      requirements.some((requirement) => !completedRequirements.includes(requirement))) {
    throw new UserFacingError('Confirm that you have completed every listed department requirement before submitting.');
  }

  const requests = readRequests();
  const existing = requests.find((request) =>
    request.student_user_id === profile.id && request.department_id === departmentId
  );
  const hasCurrentConfirmation = existing && Array.isArray(existing.completed_requirements) &&
    requirements.every((requirement) => existing.completed_requirements.includes(requirement));
  if (existing && (existing.status === 'approved' || (existing.status === 'pending' && hasCurrentConfirmation))) {
    throw new UserFacingError('A request for this department is already pending or approved.');
  }

  const now = new Date().toISOString();
  const libraryRecord = department.id === 'library'
    ? readLibraryRecords().find((item) => item.student_user_id === profile.id)
    : null;
  const request = {
    request_id: existing?.request_id || createId(),
    student_user_id: profile.id,
    student_name: profile.full_name,
    student_id: profile.student_id,
    department_id: department.id,
    department_name: department.name,
    status: 'pending',
    submitted_at: now,
    note: feedbackNotes.trim(),
    completed_requirements: [...completedRequirements],
    admin_note: '',
    validation_reason: libraryRecord?.borrowedBooksCount > 0
      ? 'Student still has borrowed books. Return all borrowed books before approval.'
      : '',
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
    actor_role: roleLabel(profile.role),
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
    approval_validation: validateClearance({ id: request.student_user_id }, request.department_id),
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
  const records = readLibraryRecords();
  return readStudents().map(({ id, full_name, student_id }) => ({
    id,
    full_name,
    student_id,
    borrowedBooksCount: records.find((record) => record.student_user_id === id)?.borrowedBooksCount || 0
  }));
}

export function updateBorrowedBooksCount({ studentId, count }) {
  const profile = requireStaff();
  if (profile.role !== 'library') throw new UserFacingError('Only Library staff can manage borrowed book counts.');
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new UserFacingError('Enter a non-negative whole number of borrowed books.');
  }
  const student = readStudents().find((item) => item.id === studentId);
  if (!student) throw new UserFacingError('The student record could not be found.');
  const libraryRecords = readLibraryRecords();
  const libraryRecord = libraryRecords.find((record) => record.student_user_id === studentId);
  if (!libraryRecord) throw new UserFacingError('The student library record could not be found.');
  libraryRecord.borrowedBooksCount = count;
  writeStorage(LIBRARY_RECORDS_KEY, libraryRecords);
  const requests = readRequests();
  const libraryRequest = requests.find((request) =>
    request.student_user_id === studentId &&
    request.department_id === 'library'
  );
  if (libraryRequest && count > 0) {
    const wasApproved = libraryRequest.status === 'approved';
    if (wasApproved) {
      libraryRequest.status = 'pending';
      libraryRequest.admin_note = '';
      libraryRequest.reviewed_at = null;
      libraryRequest.reviewed_by = null;
    }
    libraryRequest.validation_reason = 'Student still has borrowed books. Return all borrowed books before approval.';
    writeStorage(REQUESTS_KEY, requests);
    if (wasApproved) {
      saveNotification(libraryRequest, 'rejected', libraryRequest.validation_reason,
        'Please return all borrowed books before approval.');
      saveAudit({
        action: 'library_approval_reopened',
        action_status: 'Library approval returned to pending',
        details: libraryRequest.validation_reason,
        actor_username: profile.full_name,
        actor_role: roleLabel(profile.role),
        target_student: student.full_name,
        student_id: student.student_id,
        department_name: 'Library'
      });
    }
  } else if (libraryRequest?.validation_reason) {
    libraryRequest.validation_reason = '';
    writeStorage(REQUESTS_KEY, requests);
  }
  saveAudit({
    action: 'library_books_updated',
    action_status: 'Borrowed books updated',
    details: `Borrowed books count set to ${count}.`,
    actor_username: profile.full_name,
    actor_role: roleLabel(profile.role),
    target_student: student.full_name,
    student_id: student.student_id,
    department_name: 'Library'
  });
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
  if (typeof action !== 'string' || typeof requestId !== 'string' || typeof feedbackNotes !== 'string') {
    throw new UserFacingError('The request decision is invalid.');
  }
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
  if (feedbackNotes.trim().length > 240) {
    throw new UserFacingError('Keep rejection feedback under 240 characters.');
  }

  if (normalizedAction === 'approved') {
    const validation = validateClearance({ id: request.student_user_id }, request.department_id);
    if (!validation.approved) {
      request.validation_reason = validation.reason;
      writeStorage(REQUESTS_KEY, readRequests().map((item) => item.request_id === requestId ? request : item));
      saveAudit({
        action: 'clearance_approval_blocked',
        action_status: 'Approval blocked',
        details: validation.reason,
        actor_username: profile.full_name,
        actor_role: roleLabel(profile.role),
        target_student: request.student_name,
        student_id: request.student_id,
        department_name: request.department_name
      });
      saveNotification(request, 'rejected', validation.reason,
        request.department_id === 'library' && validation.reason.includes('borrowed books')
          ? 'Please return all borrowed books before approval.'
          : validation.reason);
      throw new UserFacingError(`Cannot approve clearance. Reason: ${validation.reason}`);
    }
  }

  const revoked = normalizedAction === 'revoke';
  request.status = revoked ? 'pending' : normalizedAction;
  request.admin_note = revoked ? '' : feedbackNotes;
  request.validation_reason = '';
  request.reviewed_at = revoked ? null : new Date().toISOString();
  request.reviewed_by = revoked ? null : profile.full_name;
  writeStorage(REQUESTS_KEY, readRequests().map((item) => item.request_id === requestId ? request : item));
  const reason = revoked
    ? 'Request returned to pending review.'
    : normalizedAction === 'approved'
      ? request.department_id === 'library'
        ? 'No borrowed books; all Library requirements confirmed.'
        : 'All department requirements confirmed.'
      : feedbackNotes.trim();
  if (!revoked) saveNotification(request, normalizedAction, reason);
  saveAudit({
    action: revoked ? 'clearance_approval_revoked' : 'clearance_reviewed',
    action_status: revoked ? 'Approval revoked' : normalizedAction === 'approved' ? 'Approved' : 'Rejected',
    details: reason,
    actor_username: profile.full_name,
    actor_role: roleLabel(profile.role),
    target_student: request.student_name,
    student_id: request.student_id,
    department_name: request.department_name
  });
  return request;
}

export function getAuditLogs() {
  const profile = requireStaff();
  if (!['admin', 'admin-dean', 'dean'].includes(profile.role)) {
    throw new UserFacingError('Audit logs are available to Dean and Super Admin accounts only.');
  }
  return readAudit().map((entry) => ({
    ...entry,
    action: entry.action,
    feedback_notes_snapshot: entry.reason,
    occurred_at: entry.timestamp
  }));
}

function requireStaff() {
  const profile = requireProfile();
  if (profile.role === 'student') throw new UserFacingError('A staff account is required.');
  return profile;
}
