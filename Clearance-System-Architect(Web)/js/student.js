(function () {
  'use strict';
  const app = window.ClearanceApp;
  const user = app.guardPage();
  if (!user || user.role !== 'student') return;

  function renderDashboard() {
    const progress = app.getProgress(user);
    const requests = app.state.departments.map((department) => ({ department, request: app.getRequest(user, department.id) }));
    const pending = requests.filter((item) => item.request.status === 'pending' && !item.request.notSubmitted).length;
    const rejected = requests.filter((item) => item.request.status === 'rejected').length;
    document.querySelectorAll('[data-progress]').forEach((element) => { element.textContent = progress.percent + '%'; });
    document.querySelectorAll('[data-progress-bar]').forEach((element) => { element.style.width = progress.percent + '%'; });
    document.querySelectorAll('[data-progress-summary]').forEach((element) => { element.textContent = progress.approved + ' of ' + progress.total + ' departments approved'; });
    document.querySelectorAll('[data-count-approved]').forEach((element) => { element.textContent = progress.approved; });
    document.querySelectorAll('[data-count-pending]').forEach((element) => { element.textContent = pending; });
    document.querySelectorAll('[data-count-rejected]').forEach((element) => { element.textContent = rejected; });
    const list = document.querySelector('[data-department-list]');
    if (list) {
      list.innerHTML = requests.map(({ department, request }) =>
        '<div class="department-row"><span class="department-symbol">' + app.escapeHtml(department.icon) + '</span><div class="department-row-main"><b>' + app.escapeHtml(department.name) + '</b><small>' + (request.notSubmitted ? 'No request submitted yet' : request.status === 'pending' ? 'Awaiting department review' : request.status === 'approved' ? 'Requirement completed' : 'Action required') + '</small></div>' + app.statusBadge(request.notSubmitted ? 'not-submitted' : request.status) + '</div>'
      ).join('');
    }
    const nextTitle = document.querySelector('[data-next-title]');
    const nextCopy = document.querySelector('[data-next-copy]');
    if (nextTitle && nextCopy) {
      const action = requests.find((item) => item.request.status === 'rejected') || requests.find((item) => item.request.notSubmitted) || requests.find((item) => item.request.status === 'pending');
      if (action && action.request.status === 'rejected') {
        nextTitle.textContent = 'Review a department note';
        nextCopy.textContent = 'The ' + action.department.name + ' team left an update. Read it on your clearance page, then resubmit.';
      } else if (action && action.request.notSubmitted) {
        nextTitle.textContent = 'Start your next request';
        nextCopy.textContent = 'Submit your ' + action.department.name + ' clearance request to get the review started.';
      } else if (action) {
        nextTitle.textContent = 'Your requests are in review';
        nextCopy.textContent = 'Your ' + action.department.name + ' request is with the department. Check back for an update.';
      } else {
        nextTitle.textContent = 'You’re all cleared!';
        nextCopy.textContent = 'Every department has approved your clearance. Print your summary whenever you need it.';
      }
    }
  }

  function renderClearance() {
    const requirements = document.querySelector('[data-requirements]');
    const select = document.getElementById('department');
    if (!requirements || !select) return;
    requirements.innerHTML = app.state.departments.map((department) => {
      const request = app.getRequest(user, department.id);
      return '<article class="requirement-item"><div class="requirement-main"><span class="department-symbol">' + app.escapeHtml(department.icon) + '</span><div class="requirement-copy"><b>' + app.escapeHtml(department.name) + '</b><small>' + (request.notSubmitted ? 'Not submitted' : request.status === 'pending' ? 'Submitted for review' : request.status === 'approved' ? 'Approved' : 'Resubmission requested') + '</small></div>' + app.statusBadge(request.notSubmitted ? 'not-submitted' : request.status) + '</div><div class="requirement-details"><p>' + app.escapeHtml(department.requirement) + '</p></div>' + (request.adminNote ? '<div class="review-note"><b>Department note:</b> ' + app.escapeHtml(request.adminNote) + '</div>' : '') + '</article>';
    }).join('');
    select.innerHTML = '<option value="">Choose a department</option>' + app.state.departments.map((department) => '<option value="' + app.escapeHtml(department.id) + '">' + app.escapeHtml(department.name) + '</option>').join('');
    const progress = app.getProgress(user);
    const ring = document.querySelector('[data-progress-ring]');
    if (ring) {
      ring.style.background = 'conic-gradient(var(--primary) ' + progress.percent + '%, var(--line) ' + progress.percent + '%)';
      ring.querySelector('[data-progress-ring-number]').textContent = progress.percent + '%';
    }
    const copy = document.querySelector('[data-clearance-progress-copy]');
    if (copy) copy.textContent = progress.percent === 100 ? 'Your clearance is complete!' : progress.percent ? 'You’re making good progress' : 'Your clearance is getting started';
    const hint = document.querySelector('[data-requirement-hint]');
    select.onchange = () => {
      const department = app.state.departments.find((item) => item.id === select.value);
      const request = department && app.getRequest(user, department.id);
      if (!department) hint.textContent = 'Select a department to view its requirements.';
      else if (request.status === 'pending' && !request.notSubmitted) hint.textContent = 'This request is already with ' + department.name + '. Wait for its review.';
      else if (request.status === 'approved') hint.textContent = 'This request is already approved. No further submission is needed.';
      else hint.textContent = department.requirement;
    };
    const form = document.getElementById('clearance-form');
    let isSubmitting = false;
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (isSubmitting) return;
      const departmentId = select.value;
      const department = app.state.departments.find((item) => item.id === departmentId);
      const notice = document.getElementById('clearance-notice');
      if (!department) {
        app.showNotice(notice, 'Choose a department before submitting.', true);
        return;
      }
      const current = app.getRequest(user, departmentId);
      if (current.status === 'pending' && !current.notSubmitted) {
        app.showNotice(notice, 'Your ' + department.name + ' request is already awaiting review.', true);
        return;
      }
      if (current.status === 'approved') {
        app.showNotice(notice, 'Your ' + department.name + ' request is already approved.', true);
        return;
      }
      const file = document.getElementById('attachment').files[0];
      const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
      if (file && file.size > 1024 * 1024) {
        app.showNotice(notice, 'Choose a supporting document smaller than 1 MB.', true);
        return;
      }
      if (file && !allowedExtensions.includes(file.name.split('.').pop().toLowerCase())) {
        app.showNotice(notice, 'Choose a PDF, JPG, PNG, DOC, or DOCX document.', true);
        return;
      }
      isSubmitting = true;
      const submitButton = form.querySelector('[type="submit"]');
      submitButton.disabled = true;
      try {
        let attachmentData = '';
        if (file) {
          try {
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('File could not be read.'));
              reader.onerror = () => reject(reader.error || new Error('File could not be read.'));
              reader.readAsDataURL(file);
            });
            attachmentData = dataUrl.split(',')[1] || '';
          } catch (error) {
            console.error('Could not read the supporting document:', error);
            app.showNotice(notice, 'The selected document could not be read. Please choose it again.', true);
            return;
          }
        }
        const users = app.getUsers();
        const savedUser = users.find((account) => account.username === user.username);
        if (!savedUser) {
          app.showNotice(notice, 'Your student record could not be found. Please sign in again.', true);
          return;
        }
        savedUser.requests = savedUser.requests || [];
        const updated = {
          department: departmentId, status: 'pending', submittedAt: new Date().toISOString(),
          attachment: file ? file.name : '', attachmentData,
          note: document.getElementById('request-note').value.trim(), adminNote: ''
        };
        const index = savedUser.requests.findIndex((request) => request.department === departmentId);
        if (index === -1) savedUser.requests.push(updated);
        else savedUser.requests[index] = updated;
        if (!app.saveUsers(users)) {
          app.showNotice(notice, 'Your request could not be saved. Check browser storage and try again.', true);
          return;
        }
        user.requests = savedUser.requests;
        form.reset();
        hint.textContent = 'Select a department to view its requirements.';
        renderDashboard();
        renderClearance();
        app.showNotice(document.getElementById('clearance-notice'), 'Your ' + department.name + ' request was submitted for review.', false);
      } finally {
        isSubmitting = false;
        submitButton.disabled = false;
      }
    };
  }

  renderDashboard();
  renderClearance();

  window.addEventListener('storage', (event) => {
    if (event.key !== app.state.usersKey) return;
    const updatedUser = app.currentUser();
    if (!updatedUser || updatedUser.role !== 'student') {
      window.location.replace('login.html');
      return;
    }
    user.requests = updatedUser.requests || [];
    renderDashboard();
    renderClearance();
  });
})();
