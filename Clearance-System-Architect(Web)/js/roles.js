export const STAFF_ROLES = new Set([
  'admin',
  'admin-dean',
  'dean',
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
  'admin-dean': ['student-affairs', 'dean'],
  dean: ['student-affairs', 'dean']
};

export function isStaffRole(role) {
  return STAFF_ROLES.has(String(role).toLowerCase());
}

export function canReviewDepartment(role, departmentId) {
  const normalizedRole = String(role).toLowerCase();
  return normalizedRole === 'admin' ||
    DEPARTMENT_BY_ROLE[normalizedRole] === departmentId ||
    (DEPARTMENTS_BY_ROLE[normalizedRole] || []).includes(departmentId);
}

export function canManageDepartmentRequirements(role, departmentId) {
  const normalizedRole = String(role).toLowerCase();
  return normalizedRole === 'admin' || DEPARTMENT_BY_ROLE[normalizedRole] === departmentId;
}

export function isDeanRole(role) {
  return ['admin', 'admin-dean', 'dean'].includes(String(role).toLowerCase());
}
