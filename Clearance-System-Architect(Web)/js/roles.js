export const STAFF_ROLES = new Set([
  'admin',
  'admin-dean',
  'registrar',
  'clinic',
  'library',
  'guidance',
  'accounting',
  'faculty'
]);

const DEPARTMENT_BY_ROLE = {
  registrar: 'registrar',
  clinic: 'clinic',
  library: 'library',
  guidance: 'guidance',
  accounting: 'accounting',
  faculty: 'faculty'
};

const DEPARTMENTS_BY_ROLE = {
  'admin-dean': ['student-affairs']
};

export function isStaffRole(role) {
  return STAFF_ROLES.has(String(role).toLowerCase());
}

export function canReviewDepartment(role, departmentId) {
  const normalizedRole = String(role).toLowerCase();
  return DEPARTMENT_BY_ROLE[normalizedRole] === departmentId ||
    (DEPARTMENTS_BY_ROLE[normalizedRole] || []).includes(departmentId);
}

export function isDeanRole(role) {
  return ['admin', 'admin-dean'].includes(String(role).toLowerCase());
}
