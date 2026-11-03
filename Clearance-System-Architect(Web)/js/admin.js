(function () {
  'use strict';
  const app = window.ClearanceApp;
  const user = app.guardPage();
  if (!user || user.role !== 'admin') return;

  let activeFilter = 'all';
  let query = '';
  const rowsContainer = document.querySelector('[data-request-rows]');
  const rejectionModal = document.querySelector('[data-reject-modal]');
  const rejectionForm = document.querySelector('[data-reject-form]');
  const rejectionNote = document.getElementById('rejection-note');
  let pendingRejection = null;

  function updateRequest(username, departmentId, status, adminNote) {
    const errorNotice = rejectionModal.hidden
      ? document.getElementById('admin-notice')
      : document.querySelector('[data-reject-notice]');
    const users = app.getUsers();
    const student = users.find((account) => account.username === username && account.role === 'student');
    if (!student) {
      app.showNotice(errorNotice, 'The student record could not be found. Refresh the page and try again.', true);
      return false;
    }
    const request = (student.requests || []).find((item) => item.department === departmentId);
    if (!request) {
      app.showNotice(errorNotice, 'The clearance request could not be found. Refresh the page and try again.', true);
      return false;
    }
    if (request.status !== 'pending' || request.notSubmitted) {
      app.showNotice(errorNotice, 'This request has already changed. The records have been refreshed.', true);
      render();
      return false;
    }
    request.status = status;
    request.adminNote = adminNote;
    if (!app.saveUsers(users)) {
      app.showNotice(errorNotice, 'The update could not be saved in browser storage. Please try again.', true);
      return false;
    }
    document.getElementById('admin-notice').hidden = true;
    document.querySelector('[data-reject-notice]').hidden = true;
    render();
    return true;
  }

  function closeRejectionModal() {
    rejectionModal.hidden = true;
    rejectionForm.reset();
    rejectionNote.setCustomValidity('');
    pendingRejection = null;
  }

  function requestRows() {
    return app.getUsers().filter((account) => account.role === 'student').flatMap((student) =>
      app.state.departments.map((department) => ({ student, department, request: app.getRequest(student, department.id) }))
    );
  }

  function render() {
    const users = app.getUsers();
    const rows = requestRows();
    const filtered = rows.filter(({ student, department, request }) => {
      const searchable = (student.name + ' ' + student.studentId + ' ' + student.program + ' ' + department.name).toLowerCase();
      const status = request.notSubmitted ? 'not-submitted' : request.status;
      return searchable.includes(query) && (activeFilter === 'all' || status === activeFilter);
    });
    const totals = rows.reduce((result, row) => {
      if (row.request.notSubmitted) return result;
      result[row.request.status] = (result[row.request.status] || 0) + 1;
      return result;
    }, {});
    document.querySelector('[data-admin-students]').textContent = users.filter((account) => account.role === 'student').length;
    document.querySelector('[data-admin-pending]').textContent = totals.pending || 0;
    document.querySelector('[data-admin-approved]').textContent = totals.approved || 0;
    document.querySelector('[data-admin-rejected]').textContent = totals.rejected || 0;
    document.querySelector('[data-filter-all]').textContent = rows.length;
    document.querySelector('[data-table-count]').textContent = 'Showing ' + filtered.length + ' of ' + rows.length + ' department records';
    document.querySelector('[data-admin-empty]').hidden = filtered.length > 0;
    rowsContainer.innerHTML = filtered.map(({ student, department, request }) => {
      const action = request.status === 'pending' && !request.notSubmitted
        ? '<div class="table-actions"><button class="action-button approve" data-action="approve" data-user="' + app.escapeHtml(student.username) + '" data-department="' + app.escapeHtml(department.id) + '">Approve</button><button class="action-button reject" data-action="reject" data-user="' + app.escapeHtml(student.username) + '" data-department="' + app.escapeHtml(department.id) + '">Reject</button></div>'
        : '<span>—</span>';
      const submittedAt = request.submittedAt ? new Date(request.submittedAt) : null;
      const date = submittedAt && !Number.isNaN(submittedAt.getTime())
        ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(submittedAt)
        : 'Not submitted';
      const attachment = request.attachment
        ? request.attachmentData
          ? '<a class="attachment-name" title="Download ' + app.escapeHtml(request.attachment) + '" href="data:application/octet-stream;base64,' + app.escapeHtml(request.attachmentData) + '" download="' + app.escapeHtml(request.attachment) + '">⇩ ' + app.escapeHtml(request.attachment) + '</a>'
          : '<span class="attachment-name" title="' + app.escapeHtml(request.attachment) + '">▧ ' + app.escapeHtml(request.attachment) + '</span>'
        : '<span>—</span>';
      const studentNote = request.note ? '<small class="request-note" title="' + app.escapeHtml(request.note) + '">Note: ' + app.escapeHtml(request.note) + '</small>' : '';
      return '<tr><td><div class="student-cell"><span class="user-avatar">' + app.escapeHtml(app.initials(student.name)) + '</span><span><b>' + app.escapeHtml(student.name) + '</b><small>' + app.escapeHtml(student.studentId) + '</small></span></div></td><td>' + app.escapeHtml(department.name) + studentNote + '</td><td>' + app.escapeHtml(date) + '</td><td>' + attachment + '</td><td>' + app.statusBadge(request.notSubmitted ? 'not-submitted' : request.status) + '</td><td>' + action + '</td></tr>';
    }).join('');
  }

  document.querySelector('[data-admin-search]').addEventListener('input', (event) => {
    query = event.target.value.trim().toLowerCase();
    render();
  });
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((pill) => pill.classList.toggle('active', pill === button));
    render();
  }));
  rowsContainer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'reject') {
      pendingRejection = { username: button.dataset.user, department: button.dataset.department };
      document.querySelector('[data-reject-notice]').hidden = true;
      rejectionModal.hidden = false;
      document.getElementById('rejection-note').focus();
      return;
    }
    updateRequest(button.dataset.user, button.dataset.department, 'approved', '');
  });
  rejectionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!pendingRejection) return;
    const note = rejectionNote.value.trim();
    rejectionNote.setCustomValidity(note ? '' : 'Enter feedback for the student before rejecting this request.');
    if (!rejectionNote.reportValidity()) return;
    const saved = updateRequest(pendingRejection.username, pendingRejection.department, 'rejected', note);
    if (saved) closeRejectionModal();
  });
  rejectionNote.addEventListener('input', () => rejectionNote.setCustomValidity(''));
  document.querySelectorAll('[data-cancel-rejection]').forEach((button) => button.addEventListener('click', closeRejectionModal));
  rejectionModal.addEventListener('click', (event) => {
    if (event.target === rejectionModal) closeRejectionModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !rejectionModal.hidden) closeRejectionModal();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === app.state.usersKey) render();
  });
  render();
})();
