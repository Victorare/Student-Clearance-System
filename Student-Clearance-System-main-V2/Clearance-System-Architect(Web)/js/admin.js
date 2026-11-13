import { escapeHtml, guardPage, initials, showNotice, statusBadge } from './app.js';
import { getAdminRequests, getAdminStatusCounts, getAdminStudentCount, getAuditLogs, reviewClearanceRequest, friendlyError } from './demo-store.js';
import { renderAdminChart } from './admin-chart.js';
import { canReviewDepartment, isDeanRole, isStaffRole } from './roles.js';
import { showToast } from './toast.js';

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
  let pendingRejection = null;
  let busy = false;

  function closeRejectionModal() {
    rejectionModal.hidden = true;
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
      const action = request.status === 'pending' && canReviewDepartment(user.role, request.department_id)
        ? '<div class="table-actions"><button class="action-button approve" data-action="approve" data-request-id="' + escapeHtml(request.request_id) + '">Approve</button><button class="action-button reject" data-action="reject" data-request-id="' + escapeHtml(request.request_id) + '">Reject</button></div>'
        : '<span>—</span>';
      return '<tr><td><div class="student-cell"><span class="user-avatar">' + escapeHtml(initials(student.full_name)) + '</span><span><b>' + escapeHtml(student.full_name || 'Student') + '</b><small>' + escapeHtml(student.student_id || '') + '</small></span></div></td><td>' + escapeHtml(department.name || request.department_id) + note + '</td><td>' + escapeHtml(date) + '</td><td>' + statusBadge(request.status.toLowerCase()) + '</td><td>' + action + '</td></tr>';
    }).join('');
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
      document.querySelector('[data-clearance-scope]').textContent = user.role === 'registrar'
        ? 'All department statuses are visible; only Registrar requests can be reviewed.'
        : user.role === 'admin-dean' || user.role === 'admin'
          ? 'All department statuses are visible to the Dean.'
          : user.role === 'faculty'
              ? 'Only Faculty department clearance requests are visible.'
            : 'Only ' + user.role + ' department clearance requests are visible.';
      renderRows();
      await renderAdminChart(chartContainer);
      if (isDeanRole(user.role)) await loadAuditLogs();
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
      const date = new Date(entry.occurred_at);
      const timestamp = Number.isNaN(date.getTime())
        ? '—'
        : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
      return '<tr><td>' + escapeHtml(entry.actor?.full_name || 'Staff') +
        '</td><td>' + escapeHtml(entry.target?.full_name || 'Student') + ' <small>' + escapeHtml(entry.target?.student_id || '') +
        '</small></td><td>' + escapeHtml(entry.department?.name || '—') + '</td><td>' + escapeHtml(entry.action) +
        '</td><td>' + escapeHtml(entry.feedback_notes_snapshot || '—') + '</td><td>' + escapeHtml(timestamp) + '</td></tr>';
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
      showToast(status === 'Approved' ? 'The request was approved.' : 'The request was rejected and feedback was sent.', 'success');
      await loadDashboard();
    } catch (error) {
      const notice = rejectionModal.hidden
        ? document.getElementById('admin-notice')
        : document.querySelector('[data-reject-notice]');
      showNotice(notice, friendlyError(error, 'The decision could not be saved. Refresh and try again.'), true);
    } finally {
      busy = false;
    }
  }

  document.querySelector('[data-admin-search]').addEventListener('input', (event) => {
    query = event.target.value.trim().toLowerCase();
    renderRows();
  });
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((pill) => pill.classList.toggle('active', pill === button));
    renderRows();
  }));
  rowsContainer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || busy) return;
    if (button.dataset.action === 'reject') {
      pendingRejection = button.dataset.requestId;
      document.querySelector('[data-reject-notice]').hidden = true;
      rejectionModal.hidden = false;
      rejectionNote.focus();
      return;
    }
    updateRequest(button.dataset.requestId, 'Approved', '');
  });
  rejectionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!pendingRejection) return;
    const note = rejectionNote.value.trim();
    rejectionNote.setCustomValidity(note ? '' : 'Enter feedback for the student before rejecting this request.');
    if (!rejectionNote.reportValidity()) return;
    updateRequest(pendingRejection, 'Rejected', note);
  });
  rejectionNote.addEventListener('input', () => rejectionNote.setCustomValidity(''));
  document.querySelectorAll('[data-cancel-rejection]').forEach((button) => button.addEventListener('click', closeRejectionModal));
  rejectionModal.addEventListener('click', (event) => {
    if (event.target === rejectionModal) closeRejectionModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !rejectionModal.hidden) closeRejectionModal();
  });

  loadDashboard();
}
