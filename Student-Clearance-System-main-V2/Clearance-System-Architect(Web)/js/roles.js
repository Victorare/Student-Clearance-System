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

export function isStaffRole(role) {
  return STAFF_ROLES.has(String(role).toLowerCase());
}

export function canReviewDepartment(role, departmentId) {
  const normalizedRole = String(role).toLowerCase();
  return normalizedRole === 'admin' || normalizedRole === 'admin-dean' || DEPARTMENT_BY_ROLE[normalizedRole] === departmentId;
}

export function isDeanRole(role) {
  return ['admin', 'admin-dean'].includes(String(role).toLowerCase());
}
