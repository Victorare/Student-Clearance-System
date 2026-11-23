import { escapeHtml, guardPage, initials, showNotice, statusBadge } from './app.js?v=olopsc-v10';
import { getAdminRequests, getAdminRecentActivity, getAdminStatusCounts, getAdminStudentCount, getAdminStudents, getAuditLogs, reviewClearanceRequest, updateBorrowedBooksCount, friendlyError } from './demo-store.js?v=olopsc-v9';
import { renderAdminChart } from './admin-chart.js?v=olopsc-v6';
import { canReviewDepartment, isDeanRole, isStaffRole } from './roles.js?v=olopsc-v6';
import { showToast } from './toast.js?v=olopsc-v6';
import { openModal } from './modal.js?v=olopsc-v6';

const user = await guardPage();
if (user && isStaffRole(user.role)) {
  let activeFilter = 'all';
  let query = '';
  let requests = [];
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
      const dateValue = request.submission_timestamp ? new Date(request.submission_timestamp) : null;
      const date = dateValue && !Number.isNaN(dateValue.getTime())
        ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(dateValue)
        : '—';
      const note = request.feedback_notes
        ? '<small class="request-note" title="' + escapeHtml(request.feedback_notes) + '">Note: ' + escapeHtml(request.feedback_notes) + '</small>'
        : '';
      let action = '<span>—</span>';
      if (canReviewDepartment(user.role, request.department_id)) {
        if (request.status === 'pending') {
          const validationReason = request.approval_validation?.approved
            ? ''
            : request.approval_validation?.reason;
          action = '<div class="table-actions"><button class="action-button approve" data-action="approve" data-request-id="' + escapeHtml(request.request_id) + '">Approve</button><button class="action-button reject" data-action="reject" data-request-id="' + escapeHtml(request.request_id) + '">Reject</button></div>' +
            (validationReason ? '<small class="request-note">Cannot approve yet: ' + escapeHtml(validationReason) + '</small>' : '');
        } else if (request.status === 'approved') {
          action = '<div class="table-actions"><button class="action-button reject" data-action="revoke" data-request-id="' + escapeHtml(request.request_id) + '">Revoke approval</button></div>';
        }
      }
      return '<tr><td><div class="student-cell"><span class="user-avatar">' + escapeHtml(initials(student.full_name)) + '</span><span><b>' + escapeHtml(student.full_name || 'Student') + '</b><small>' + escapeHtml(student.student_id || '') + '</small></span></div></td><td>' + escapeHtml(department.name || request.department_id) + note + '</td><td>' + escapeHtml(date) + '</td><td>' + statusBadge(request.status.toLowerCase()) + '</td><td>' + action + '</td></tr>';
    }).join('');
  }

  function renderRecentActivity() {
    const container = document.querySelector('[data-admin-activity]');
    if (!container) return;
    const entries = getAdminRecentActivity();
    container.innerHTML = entries.length
      ? entries.map((entry) => {
        const date = new Date(entry.occurred_at);
        const time = Number.isNaN(date.getTime())
          ? '—'
          : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
        const action = entry.action === 'Requirements updated'
          ? 'Requirements updated'
          : entry.action === 'Approval revoked'
            ? entry.action
            : entry.action.charAt(0).toUpperCase() + entry.action.slice(1);
        const subject = entry.target?.full_name || entry.department?.name || 'Department';
        return '<article class="activity-row"><time>' + escapeHtml(time) + '</time><span class="activity-indicator ' +
          (entry.action.toLowerCase().includes('reject') ? 'activity-rejected' : 'activity-approved') + '">' +
          (entry.action.toLowerCase().includes('reject') ? '!' : '✓') + '</span><div><b>' +
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
      const [students, counts, loadedRequests] = await Promise.all([
        getAdminStudentCount(),
        getAdminStatusCounts(),
        getAdminRequests()
      ]);
      requests = loadedRequests;
      document.querySelector('[data-admin-students]').textContent = students;
      document.querySelector('[data-admin-pending]').textContent = counts.Pending || 0;
      document.querySelector('[data-admin-approved]').textContent = counts.Approved || 0;
      document.querySelector('[data-admin-rejected]').textContent = counts.Rejected || 0;
      document.querySelector('[data-clearance-scope]').textContent = user.role === 'admin'
          ? 'Super Admin access includes requests from every department.'
          : user.role === 'dean' || user.role === 'admin-dean'
            ? 'Dean review scope includes the Dean’s Office and Student Affairs.'
          : user.role === 'registrar'
        ? 'Only Registrar department requests are visible and reviewable.'
          : user.role === 'faculty'
              ? 'Only Faculty department clearance requests are visible.'
            : isStaffRole(user.role)
              ? 'Only ' + user.role + ' department clearance requests are visible and reviewable.'
              : 'No department requests are assigned to this account.';
      renderRows();
      renderRecentActivity();
      await renderAdminChart(chartContainer);
      if (isDeanRole(user.role)) await loadAuditLogs();
      if (user.role === 'library') {
        libraryTools.hidden = false;
        renderLibraryStudents(await getAdminStudents());
      }
    } catch (error) {
      showToast(friendlyError(error, 'The admin workspace could not be loaded. Refresh and try again.'), 'error');
    }
  }

  async function loadAuditLogs() {
    const panel = document.querySelector('[data-audit-panel]');
    const rowsContainer = document.querySelector('[data-audit-rows]');
    const emptyState = document.querySelector('[data-audit-empty]');
    const auditLogs = await getAuditLogs();
    panel.hidden = false;
    emptyState.hidden = auditLogs.length > 0;
    rowsContainer.innerHTML = auditLogs.map((entry) => {
      const date = new Date(entry.timestamp || entry.occurred_at);
      const timestamp = Number.isNaN(date.getTime())
        ? '—'
        : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
      const studentName = entry.student || entry.target?.full_name || '—';
      const studentId = entry.studentID || entry.target?.student_id || '';
      const departmentName = typeof entry.department === 'string'
        ? entry.department
        : entry.department?.name || '—';
      return '<tr><td>' + escapeHtml(entry.actor || entry.actor_username || 'Staff') +
        '</td><td>' + escapeHtml(entry.actorRole || 'Staff') +
        '</td><td>' + escapeHtml(studentName) + (studentId ? ' <small>' + escapeHtml(studentId) + '</small>' : '') +
        '</td><td>' + escapeHtml(departmentName) +
        '</td><td>' + escapeHtml(entry.action) +
        '</td><td>' + escapeHtml(entry.reason || entry.feedback_notes_snapshot || '—') +
        '</td><td>' + escapeHtml(timestamp) + '</td></tr>';
    }).join('');
  }

  async function updateRequest(requestId, status, feedbackNotes) {
    if (busy) return;
    busy = true;
    try {
      await reviewClearanceRequest({ requestId, action: status, feedbackNotes });
      document.getElementById('admin-notice').hidden = true;
      document.querySelector('[data-reject-notice]').hidden = true;
      closeRejectionModal();
      showToast(status === 'Approved'
        ? 'The request was approved.'
        : status === 'Revoke'
          ? 'The approval was revoked. The request is pending again.'
          : 'The request was rejected and feedback was sent.', 'success');
      await loadDashboard();
    } catch (error) {
      const notice = rejectionModal.hidden
        ? document.getElementById('admin-notice')
        : document.querySelector('[data-reject-notice]');
      showNotice(notice, friendlyError(error, 'The decision could not be saved. Refresh and try again.'), true);
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
    updateRequest(button.dataset.requestId, button.dataset.action === 'revoke' ? 'Revoke' : 'Approved', '');
  });
  rejectionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!pendingRejection) return;
    const note = rejectionNote.value.trim();
    rejectionNote.setCustomValidity(note ? '' : 'Enter feedback for the student before rejecting this request.');
    if (!rejectionNote.reportValidity()) return;
    updateRequest(pendingRejection, 'Rejected', note);
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
    try {
      await updateBorrowedBooksCount({ studentId: form.dataset.studentId, count });
      await loadDashboard();
      showNotice(libraryNotice, 'The borrowed books count was updated.', false);
    } catch (error) {
      showNotice(libraryNotice, friendlyError(error, 'The borrowed books count could not be updated. Try again.'), true);
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
  const refreshAdminData = () => loadDashboard();
  window.addEventListener('storage', (event) => {
    if (['olopsc_clearance_demo_requests', 'olopsc_clearance_demo_students', 'olopsc_clearance_demo_library_records', 'olopsc_clearance_demo_audit'].includes(event.key)) refreshAdminData();
  });
}
