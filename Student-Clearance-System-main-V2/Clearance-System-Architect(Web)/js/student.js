import { escapeHtml, getProgress, getRequest, guardPage, showNotice, statusBadge } from './app.js';
import { getDepartments, getStudentClearance, friendlyError, submitClearanceRequest } from './demo-store.js';
import { showToast } from './toast.js';

const user = await guardPage();
if (user?.role === 'student') {
  const [departments, requests] = await Promise.all([
    getDepartments(),
    getStudentClearance(user.id)
  ]).catch((error) => {
    showToast(friendlyError(error, 'Your clearance could not be loaded. Refresh and try again.'), 'error');
    return [null, null];
  });

  if (departments && requests) {
    user.departments = departments.map((department) => ({
      id: department.department_id,
      name: department.name,
      icon: '•',
      requirement: department.requirement
    }));
    user.requests = requests.map((request) => ({
      department: request.department_id,
      status: request.status.toLowerCase(),
      submittedAt: request.submission_timestamp,
      note: request.feedback_notes,
      adminNote: request.status === 'rejected' ? request.feedback_notes : '',
      notSubmitted: false
    }));

    function renderDashboard() {
      const progress = getProgress(user);
      const rows = user.departments.map((department) => ({ department, request: getRequest(user, department.id) }));
      const pending = rows.filter(({ request }) => request.status === 'pending' && !request.notSubmitted).length;
      const rejected = rows.filter(({ request }) => request.status === 'rejected').length;
      document.querySelectorAll('[data-progress]').forEach((element) => { element.textContent = progress.percent + '%'; });
      document.querySelectorAll('[data-progress-bar]').forEach((element) => { element.style.width = progress.percent + '%'; });
      document.querySelectorAll('[data-progress-summary]').forEach((element) => {
        element.textContent = progress.approved + ' of ' + user.departments.length + ' departments approved';
      });
      document.querySelectorAll('[data-department-count]').forEach((element) => {
        element.textContent = user.departments.length;
      });
      document.querySelectorAll('[data-count-approved]').forEach((element) => { element.textContent = progress.approved; });
      document.querySelectorAll('[data-count-pending]').forEach((element) => { element.textContent = pending; });
      document.querySelectorAll('[data-count-rejected]').forEach((element) => { element.textContent = rejected; });
      const list = document.querySelector('[data-department-list]');
      if (list) {
        list.innerHTML = rows.map(({ department, request }) =>
          '<div class="department-row"><span class="department-symbol">' + escapeHtml(department.icon) + '</span><div class="department-row-main"><b>' + escapeHtml(department.name) + '</b><small>' + (request.notSubmitted ? 'No request submitted yet' : request.status === 'pending' ? 'Awaiting department review' : request.status === 'approved' ? 'Requirement completed' : 'Action required') + '</small></div>' + statusBadge(request.notSubmitted ? 'not-submitted' : request.status) + '</div>'
        ).join('');
      }

      const nextTitle = document.querySelector('[data-next-title]');
      const nextCopy = document.querySelector('[data-next-copy]');
      if (nextTitle && nextCopy) {
        const action = rows.find((item) => item.request.status === 'rejected') ||
          rows.find((item) => item.request.notSubmitted) ||
          rows.find((item) => item.request.status === 'pending');
        if (action?.request.status === 'rejected') {
          nextTitle.textContent = 'Review a department note';
          nextCopy.textContent = 'The ' + action.department.name + ' team left an update. Read it on your clearance page, then resubmit.';
        } else if (action?.request.notSubmitted) {
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
      requirements.innerHTML = user.departments.map((department) => {
        const request = getRequest(user, department.id);
        const statusText = request.notSubmitted ? 'Not submitted' : request.status === 'pending' ? 'Submitted for review' : request.status === 'approved' ? 'Approved' : 'Resubmission requested';
        return '<article class="requirement-item"><div class="requirement-main"><span class="department-symbol">' + escapeHtml(department.icon) + '</span><div class="requirement-copy"><b>' + escapeHtml(department.name) + '</b><small>' + statusText + '</small></div>' + statusBadge(request.notSubmitted ? 'not-submitted' : request.status) + '</div><div class="requirement-details"><p>' + escapeHtml(department.requirement) + '</p></div>' + (request.adminNote ? '<div class="review-note"><b>Department note:</b> ' + escapeHtml(request.adminNote) + '</div>' : '') + '</article>';
      }).join('');
      select.innerHTML = '<option value="">Choose a department</option>' +
        user.departments.map((department) => '<option value="' + escapeHtml(department.id) + '">' + escapeHtml(department.name) + '</option>').join('');

      const progress = getProgress(user);
      const ring = document.querySelector('[data-progress-ring]');
      if (ring) {
        ring.style.background = 'conic-gradient(var(--primary) ' + progress.percent + '%, var(--line) ' + progress.percent + '%)';
        ring.querySelector('[data-progress-ring-number]').textContent = progress.percent + '%';
      }
      const copy = document.querySelector('[data-clearance-progress-copy]');
      if (copy) copy.textContent = progress.percent === 100 ? 'Your clearance is complete!' : progress.percent ? 'You’re making good progress' : 'Your clearance is getting started';
      const hint = document.querySelector('[data-requirement-hint]');
      select.onchange = () => {
        const department = user.departments.find((item) => item.id === select.value);
        const request = department && getRequest(user, department.id);
        if (!department) hint.textContent = 'Select a department to view its requirements.';
        else if (request.status === 'pending' && !request.notSubmitted) hint.textContent = 'This request is already with ' + department.name + '. Wait for its review.';
        else if (request.status === 'approved') hint.textContent = 'This request is already approved. No further submission is needed.';
        else hint.textContent = department.requirement;
      };

      const form = document.getElementById('clearance-form');
      let isSubmitting = false;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isSubmitting) return;
        const departmentId = select.value;
        const department = user.departments.find((item) => item.id === departmentId);
        const notice = document.getElementById('clearance-notice');
        if (!department) {
          showNotice(notice, 'Choose a department before submitting.', true);
          return;
        }
        const current = getRequest(user, departmentId);
        if (current.status === 'pending' && !current.notSubmitted) {
          showNotice(notice, 'Your ' + department.name + ' request is already awaiting review.', true);
          return;
        }
        if (current.status === 'approved') {
          showNotice(notice, 'Your ' + department.name + ' request is already approved.', true);
          return;
        }
        const note = document.getElementById('request-note').value.trim();
        if (note.length > 1000) {
          showNotice(notice, 'Keep your note under 1,000 characters.', true);
          return;
        }

        isSubmitting = true;
        const submitButton = form.querySelector('[type="submit"]');
        submitButton.disabled = true;
        notice.hidden = true;
        try {
          await submitClearanceRequest({
            departmentId,
            feedbackNotes: note
          });
          const updated = {
            department: departmentId,
            status: 'pending',
            submittedAt: new Date().toISOString(),
            attachment: '',
            note,
            adminNote: '',
            notSubmitted: false
          };
          const index = user.requests.findIndex((request) => request.department === departmentId);
          if (index === -1) user.requests.push(updated);
          else user.requests[index] = updated;
          form.reset();
          hint.textContent = 'Select a department to view its requirements.';
          renderDashboard();
          renderClearance();
          showNotice(document.getElementById('clearance-notice'), 'Your ' + department.name + ' request was submitted for review.', false);
        } catch (error) {
          showNotice(notice, friendlyError(error, 'Your request could not be submitted. Please try again.'), true);
        } finally {
          isSubmitting = false;
          submitButton.disabled = false;
        }
      });
    }

    renderDashboard();
    renderClearance();
  }
}
