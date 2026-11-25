import { applyUser, escapeHtml, initials, showNotice, statusBadge, toAppUser } from './app.js?v=olopsc-v13';
import { renderAdminChart } from './admin-chart.js?v=olopsc-v7';
import { showToast } from './toast.js?v=olopsc-v6';
import { openModal } from './modal.js?v=olopsc-v6';

const allowedRoles = ['dean', 'registrar', 'clinic', 'library', 'guidance', 'accounting', 'faculty', 'super_admin'];
const auth = await requireAuth(allowedRoles);
if (auth) {
  const profile = auth.profile;
  applyUser(profile);
  const user = toAppUser(profile);
  const isAuditViewer = ['dean', 'super_admin'].includes(user.role);
  let activeFilter = 'all';
  let query = '';
  let requests = [];
  let departments = [];
  let studentProfiles = [];
  let auditLogs = [];
  let departmentIds = [];
  let departmentsById = new Map();
  let studentsById = new Map();
  const rowsContainer = document.querySelector('[data-request-rows]');
  const rejectionModal = document.querySelector('[data-reject-modal]');
  const rejectionForm = document.querySelector('[data-reject-form]');
  const rejectionNote = document.getElementById('rejection-note');
  const chartContainer = document.querySelector('[data-clearance-chart]');
  const libraryTools = document.querySelector('[data-library-tools]');
  const libraryRows = document.querySelector('[data-library-student-rows]');
  const libraryNotice = document.querySelector('[data-library-notice]');
  const overviewLink = document.querySelector('.side-nav a[href="admin-dashboard.html"]');
  const requestsLink = document.querySelector('.side-nav a[href="#requests"]');
  let pendingRejection = null;
  let busy = false;
  let closeActiveModal = null;

  function updateActiveNavigation() {
    const onRequests = window.location.hash === '#requests';
    overviewLink?.classList.toggle('active', !onRequests);
    requestsLink?.classList.toggle('active', onRequests);
    if (onRequests) {
      overviewLink?.removeAttribute('aria-current');
      requestsLink?.setAttribute('aria-current', 'location');
    } else {
      overviewLink?.setAttribute('aria-current', 'page');
      requestsLink?.removeAttribute('aria-current');
    }
  }

  function closeRejectionModal() {
    closeActiveModal?.();
    closeActiveModal = null;
    rejectionForm.reset();
    rejectionNote.setCustomValidity('');
    pendingRejection = null;
  }

  function filteredRequests() {
    return requests.filter((request) => {
      const student = request.student || {};
      const department = request.department || {};
      const searchable = `${student.full_name || ''} ${student.student_id || ''} ${student.program || ''} ${department.name || ''}`.toLowerCase();
      return searchable.includes(query) && (activeFilter === 'all' || request.status.toLowerCase() === activeFilter);
    });
  }

  function renderRows() {
    const filtered = filteredRequests();
    document.querySelector('[data-filter-all]').textContent = requests.length;
    document.querySelector('[data-table-count]').textContent = 'Showing ' + filtered.length + ' of ' + requests.length + ' submitted requests';
    document.querySelector('[data-admin-empty]').hidden = filtered.length > 0;
    rowsContainer.innerHTML = filtered.map((request) => {
      const student = request.student || {};
      const department = request.department || {};
      const dateValue = request.updated_at ? new Date(request.updated_at) : null;
      const date = dateValue && !Number.isNaN(dateValue.getTime())
        ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(dateValue)
        : '—';
      const note = [request.student_note, request.admin_feedback].filter(Boolean).map((text) =>
        '<small class="request-note">' + escapeHtml(text) + '</small>'
      ).join('');
      let action = '<span>—</span>';
      if (request.status === 'pending') {
        const validationReason = request.approval_validation?.approved
          ? ''
          : request.approval_validation?.reason;
        action = '<div class="table-actions"><button class="action-button approve" data-action="approve" data-request-id="' + escapeHtml(request.request_id) + '">Approve</button><button class="action-button reject" data-action="reject" data-request-id="' + escapeHtml(request.request_id) + '">Reject</button></div>' +
          (validationReason ? '<small class="request-note">Cannot approve yet: ' + escapeHtml(validationReason) + '</small>' : '');
      } else if (request.status === 'approved') {
        action = '<div class="table-actions"><button class="action-button reject" data-action="revoke" data-request-id="' + escapeHtml(request.request_id) + '">Revoke approval</button></div>';
      }
      return '<tr><td><div class="student-cell"><span class="user-avatar">' + escapeHtml(initials(student.full_name)) + '</span><span><b>' + escapeHtml(student.full_name || 'Student') + '</b><small>' + escapeHtml(student.student_id || '') + '</small></span></div></td><td>' + escapeHtml(department.name || request.department_id) + note + '</td><td>' + escapeHtml(date) + '</td><td>' + statusBadge(request.status.toLowerCase()) + '</td><td>' + action + '</td></tr>';
    }).join('');
  }

  function renderRecentActivity() {
    const container = document.querySelector('[data-admin-activity]');
    if (!container) return;
    const entries = auditLogs.slice(0, 6);
    container.innerHTML = entries.length
      ? entries.map((entry) => {
        const date = new Date(entry.created_at || entry.occurred_at);
        const time = Number.isNaN(date.getTime())
          ? '—'
          : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
        const actionCode = String(entry.action || '');
        const rawAction = (actionCode || 'Activity recorded').replace(/^clearance_/, '');
        const action = rawAction.replace(/_/g, ' ').replace(/^\w/, (character) => character.toUpperCase());
        const student = studentsById.get(String(entry.student_id));
        const department = departmentsById.get(String(entry.department_id));
        const subject = student?.full_name || department?.name || 'Department';
        return '<article class="activity-row"><time>' + escapeHtml(time) + '</time><span class="activity-indicator ' +
          (actionCode.toLowerCase().includes('reject') ? 'activity-rejected' : 'activity-approved') + '">' +
          (actionCode.toLowerCase().includes('reject') ? '!' : '✓') + '</span><div><b>' +
          escapeHtml(action) + '</b><small>' + escapeHtml(subject) + '</small>' +
          (entry.details ? '<small class="activity-reason">Reason: ' + escapeHtml(entry.details) + '</small>' : '') +
          '</div></article>';
      }).join('')
      : '<div class="empty-state">No recent department activity.</div>';
  }

  function renderLibraryStudents(students) {
    libraryRows.innerHTML = students.map((student) =>
      '<tr><td><b>' + escapeHtml(student.full_name || 'Student') + '</b><small>' + escapeHtml(student.student_id || '') +
      '</small></td><td><form class="borrowed-books-form" data-student-id="' + escapeHtml(student.id) +
      '"><input id="borrowed-books-' + escapeHtml(student.id) + '" name="count" type="number" min="0" step="1" aria-label="Borrowed books for ' +
      escapeHtml(student.full_name || 'student') + '" value="' +
      escapeHtml(student.borrowedBooksCount) + '" required><button class="button button-outline button-small" type="submit">Save</button></form></td><td>' +
      (student.borrowedBooksCount > 0
        ? '<span class="status-badge status-rejected">Needs action</span><small>Return all borrowed books before approval.</small>'
        : '<span class="status-badge status-approved">Eligible for approval</span>') + '</td></tr>'
    ).join('');
  }

  async function loadDashboard() {
    try {
      let departmentQuery = supabaseClient.from('departments').select('*');
      if (user.role !== 'super_admin') {
        departmentQuery = departmentQuery.eq('owner_role', user.role);
      }
      const { data: departmentRows, error: departmentError } = await departmentQuery;
      if (departmentError) throw departmentError;
      departments = (departmentRows || []).map((department) => ({
        ...department,
        id: String(department.department_id ?? department.id ?? ''),
        name: department.name || department.department_name
      }));
      if (!departments.length || departments.some((department) => !department.id || !department.name)) {
        throw new Error('No valid departments are assigned to this role.');
      }
      departmentIds = departments.map((department) => department.id);
      departmentsById = new Map(departments.map((department) => [department.id, department]));

      const { data: requestRows, error: requestError } = await supabaseClient
        .from('clearance_requests')
        .select('*')
        .in('department_id', departmentIds);
      if (requestError) throw requestError;

      const studentIds = [...new Set((requestRows || [])
        .map((request) => request.student_id)
        .filter((id) => id != null)
        .map(String))];
      let studentRows = [];
      if (user.role === 'library' || user.role === 'super_admin') {
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('id,full_name,student_id,program,borrowed_books_count')
          .eq('role', 'student');
        if (error) throw error;
        studentRows = data || [];
      } else if (studentIds.length) {
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('id,full_name,student_id,program,borrowed_books_count')
          .eq('role', 'student')
          .in('id', studentIds);
        if (error) throw error;
        studentRows = data || [];
      }
      studentProfiles = studentRows.map((student) => ({
        ...student,
        borrowedBooksCount: Number(student.borrowed_books_count) || 0
      }));
      studentsById = new Map(studentProfiles.map((student) => [String(student.id), student]));
      const libraryDepartment = departments.find((department) =>
        department.id === 'library' || department.owner_role === 'library'
      );
      requests = (requestRows || []).map((request) => {
        const departmentId = String(request.department_id);
        const student = studentsById.get(String(request.student_id)) || {};
        const department = departmentsById.get(departmentId);
        if (!department) throw new Error('A clearance request is outside this role’s department scope.');
        const status = String(request.status || 'pending').toLowerCase();
        const requestId = request.id ?? request.request_id;
        if (requestId == null) throw new Error('A clearance request is missing its record ID.');
        const libraryApprovalBlocked = departmentId === libraryDepartment?.id &&
          (!student.id || student.borrowedBooksCount > 0);
        return {
          ...request,
          request_id: String(requestId),
          department_id: departmentId,
          status,
          student,
          department,
          approval_validation: {
            approved: !libraryApprovalBlocked,
            reason: libraryApprovalBlocked
              ? !student.id
                ? 'The student profile could not be loaded.'
                : 'Student still has borrowed books. Return all borrowed books before approval.'
              : ''
          }
        };
      });

      const counts = {
        Pending: requests.filter((request) => request.status === 'pending').length,
        Approved: requests.filter((request) => request.status === 'approved').length,
        Rejected: requests.filter((request) => request.status === 'rejected').length
      };
      const studentsInScope = user.role === 'library' || user.role === 'super_admin'
        ? studentProfiles.length
        : studentIds.length;
      document.querySelector('[data-admin-students]').textContent = studentsInScope;
      document.querySelector('[data-admin-pending]').textContent = counts.Pending;
      document.querySelector('[data-admin-approved]').textContent = counts.Approved;
      document.querySelector('[data-admin-rejected]').textContent = counts.Rejected;
      document.querySelector('[data-clearance-scope]').textContent = user.role === 'super_admin'
        ? 'Super Admin access includes requests from every department.'
        : user.role === 'dean'
          ? 'Dean review scope includes the Dean’s Office and Student Affairs.'
          : 'Only departments assigned to the ' + user.role + ' role are visible and reviewable.';

      try {
        const { data, error } = await supabaseClient
          .from('audit_logs')
          .select('*')
          .in('department_id', departmentIds)
          .order('created_at', { ascending: false })
          .limit(30);
        if (error) throw error;
        auditLogs = data || [];
      } catch (error) {
        auditLogs = [];
        showToast(error.message || 'Audit activity could not be loaded.', 'error');
      }

      renderRows();
      renderRecentActivity();
      renderAdminChart(chartContainer, counts);
      loadAuditLogs();
      libraryTools.hidden = user.role !== 'library';
      if (user.role === 'library') renderLibraryStudents(studentProfiles);
    } catch (error) {
      showToast(error.message || 'The admin workspace could not be loaded. Refresh and try again.', 'error');
    }
  }

  function loadAuditLogs() {
    const panel = document.querySelector('[data-audit-panel]');
    const rowsContainer = document.querySelector('[data-audit-rows]');
    const emptyState = document.querySelector('[data-audit-empty]');
    panel.hidden = !isAuditViewer;
    if (!isAuditViewer) return;
    emptyState.hidden = auditLogs.length > 0;
    rowsContainer.innerHTML = auditLogs.map((entry) => {
      const date = new Date(entry.created_at || entry.timestamp || entry.occurred_at);
      const timestamp = Number.isNaN(date.getTime())
        ? '—'
        : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
      const student = studentsById.get(String(entry.student_id));
      const department = departmentsById.get(String(entry.department_id));
      const studentId = student?.student_id || '';
      const departmentName = department?.name || '—';
      return '<tr><td>' + escapeHtml(entry.actor || (entry.actor_id === profile.id ? profile.full_name : 'Staff')) +
        '</td><td>' + escapeHtml(entry.actor_role || 'Staff') +
        '</td><td>' + escapeHtml(student?.full_name || '—') + (studentId ? ' <small>' + escapeHtml(studentId) + '</small>' : '') +
        '</td><td>' + escapeHtml(departmentName) +
        '</td><td>' + escapeHtml(entry.action) +
        '</td><td>' + escapeHtml(entry.details || '—') +
        '</td><td>' + escapeHtml(timestamp) + '</td></tr>';
    }).join('');
  }

  async function insertAuditLog({ studentId, departmentId, action, details, timestamp }) {
    const { error } = await supabaseClient.from('audit_logs').insert({
      actor_id: profile.id,
      actor_role: user.role,
      student_id: studentId,
      department_id: departmentId,
      action,
      details,
      created_at: timestamp
    });
    if (error) throw error;
  }

  async function updateRequest(requestId, action, feedbackNotes) {
    if (busy) return;
    busy = true;
    let decisionSaved = false;
    try {
      const request = requests.find((item) => item.request_id === requestId);
      if (!request) throw new Error('This request is no longer available in your department scope.');
      if (action === 'reject' && !feedbackNotes.trim()) {
        throw new Error('Enter feedback for the student before rejecting this request.');
      }
      if (feedbackNotes.trim().length > 240) {
        throw new Error('Keep rejection feedback under 240 characters.');
      }
      if (action === 'approve' && !request.approval_validation.approved) {
        throw new Error(request.approval_validation.reason);
      }
      const expectedStatus = action === 'revoke' ? 'approved' : 'pending';
      if (request.status !== expectedStatus) {
        throw new Error('This request is no longer in the expected status.');
      }

      const nextStatus = action === 'revoke' ? 'pending' : action === 'approve' ? 'approved' : 'rejected';
      const updatedAt = new Date().toISOString();
      const requestKey = request.id != null ? 'id' : 'request_id';
      const requestKeyValue = request.id ?? request.request_id;
      const { data, error } = await supabaseClient
        .from('clearance_requests')
        .update({
          status: nextStatus,
          admin_feedback: action === 'reject' ? feedbackNotes.trim() : null,
          updated_at: updatedAt
        })
        .eq(requestKey, requestKeyValue)
        .eq('department_id', request.department_id)
        .in('department_id', departmentIds)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('The request could not be updated in your department scope.');
      decisionSaved = true;

      const actionLabel = action === 'revoke' ? 'clearance_approval_revoked' : 'clearance_' + nextStatus;
      const auditDetails = action === 'reject'
        ? feedbackNotes.trim()
        : action === 'revoke'
          ? 'Approval revoked.'
          : 'Request approved.';
      try {
        await insertAuditLog({
          studentId: request.student_id,
          departmentId: request.department_id,
          action: actionLabel,
          details: auditDetails,
          timestamp: updatedAt
        });
      } catch (error) {
        throw new Error('The decision was saved, but its audit log could not be written: ' + error.message);
      }

      document.getElementById('admin-notice').hidden = true;
      document.querySelector('[data-reject-notice]').hidden = true;
      closeRejectionModal();
      showToast(action === 'approve'
        ? 'The request was approved.'
        : action === 'revoke'
          ? 'The approval was revoked. The request is pending again.'
          : 'The request was rejected and feedback was sent.', 'success');
      await loadDashboard();
    } catch (error) {
      const notice = rejectionModal.hidden
        ? document.getElementById('admin-notice')
        : document.querySelector('[data-reject-notice]');
      showNotice(notice, error.message || (decisionSaved
        ? 'The decision was saved, but the audit log could not be written.'
        : 'The decision could not be saved. Refresh and try again.'), true);
      await loadDashboard();
    } finally {
      busy = false;
    }
  }

  document.querySelector('[data-admin-search]').addEventListener('input', (event) => {
    query = event.target.value.trim().toLowerCase();
    renderRows();
  });
  window.addEventListener('hashchange', updateActiveNavigation);
  updateActiveNavigation();
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((pill) => {
    const active = pill === button;
    pill.classList.toggle('active', active);
    pill.setAttribute('aria-pressed', String(active));
  });
    renderRows();
  }));
  rowsContainer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || busy) return;
    if (button.dataset.action === 'reject') {
      pendingRejection = button.dataset.requestId;
      document.querySelector('[data-reject-notice]').hidden = true;
      closeActiveModal = openModal(rejectionModal, rejectionModal.querySelector('.reject-dialog'), rejectionNote);
      return;
    }
    updateRequest(button.dataset.requestId, button.dataset.action, '');
  });
  rejectionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!pendingRejection) return;
    const note = rejectionNote.value.trim();
    rejectionNote.setCustomValidity(note ? '' : 'Enter feedback for the student before rejecting this request.');
    if (!rejectionNote.reportValidity()) return;
    updateRequest(pendingRejection, 'reject', note);
  });
  libraryRows.addEventListener('submit', async (event) => {
    const form = event.target.closest('.borrowed-books-form');
    if (!form) return;
    event.preventDefault();
    const input = form.elements.count;
    const count = input.valueAsNumber;
    if (!Number.isSafeInteger(count) || count < 0) {
      showNotice(libraryNotice, 'Enter a non-negative whole number of borrowed books.', true);
      return;
    }
    form.querySelector('[type="submit"]').disabled = true;
    libraryNotice.hidden = true;
    let countSaved = false;
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .update({ borrowed_books_count: count })
        .eq('id', form.dataset.studentId)
        .eq('role', 'student')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('The student record could not be updated.');
      countSaved = true;
      const libraryDepartment = departments.find((department) =>
        department.id === 'library' || department.owner_role === 'library'
      );
      if (!libraryDepartment) throw new Error('The Library department is outside your current scope.');
      try {
        await insertAuditLog({
          studentId: form.dataset.studentId,
          departmentId: libraryDepartment.id,
          action: 'borrowed_books_updated',
          details: 'Borrowed books count set to ' + count + '.',
          timestamp: new Date().toISOString()
        });
      } catch (auditError) {
        throw new Error('The borrowed-books count was saved, but its audit log could not be written: ' + auditError.message);
      }
      await loadDashboard();
      showNotice(libraryNotice, 'The borrowed books count was updated.', false);
    } catch (error) {
      if (countSaved) await loadDashboard();
      showNotice(libraryNotice, error.message || 'The borrowed books count could not be updated. Try again.', true);
    } finally {
      form.querySelector('[type="submit"]').disabled = false;
    }
  });
  rejectionNote.addEventListener('input', () => rejectionNote.setCustomValidity(''));
  document.querySelectorAll('[data-cancel-rejection]').forEach((button) => button.addEventListener('click', closeRejectionModal));
  rejectionModal.addEventListener('click', (event) => {
    if (event.target === rejectionModal) closeRejectionModal();
  });
  loadDashboard();
  window.addEventListener('focus', loadDashboard);
}
