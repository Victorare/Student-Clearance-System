import { applyUser, escapeHtml, getProgress, getRequest, showNotice, statusBadge, toAppUser } from './app.js?v=olopsc-v13';
import { showToast } from './toast.js?v=olopsc-v5';

const guidanceSurveyLink = '<a class="guidance-survey-link" href="https://docs.google.com/forms/d/e/1FAIpQLSf6RhMbn4BxLnvAG16ynZRXsuqrfESO0meXrWNWjRpI_Qutaw/viewform" target="_blank" rel="noopener noreferrer">Complete Guidance Exit Survey</a>';

const auth = await requireAuth(['student']);
if (auth) {
  const profile = auth.profile;
  applyUser(profile);
  const user = toAppUser(profile);
  let dataLoaded = false;
  const mapRequests = (items) => items.map((request) => {
    const status = String(request.status || 'not-submitted').toLowerCase();
    return {
      department: String(request.department_id),
      status,
      submittedAt: request.updated_at,
      updatedAt: request.updated_at,
      note: request.student_note || '',
      adminNote: status === 'rejected' ? request.admin_feedback || '' : '',
      validationReason: '',
      completedRequirements: [],
      notSubmitted: status === 'not-submitted'
    };
  });

  try {
    const [departmentResult, requirementResult, requestResult] = await Promise.all([
      supabaseClient.from('departments').select('*'),
      supabaseClient.from('department_requirements').select('*'),
      supabaseClient
        .from('clearance_requests')
        .select('department_id,status,student_note,admin_feedback,updated_at')
        .eq('student_id', profile.id)
    ]);
    if (departmentResult.error) throw departmentResult.error;
    if (requirementResult.error) throw requirementResult.error;
    if (requestResult.error) throw requestResult.error;
    if (!Array.isArray(departmentResult.data) || departmentResult.data.length !== 8) {
      throw new Error('The student clearance requires exactly 8 departments.');
    }

    const requirementsByDepartment = new Map();
    (requirementResult.data || []).forEach((row) => {
      const departmentId = row.department_id;
      const text = row.requirement_text || row.requirement || row.description ||
        row.requirement_name || row.name || row.text;
      if (departmentId == null || typeof text !== 'string' || !text.trim()) {
        throw new Error('A department requirement is missing its department or description.');
      }
      const requirements = requirementsByDepartment.get(String(departmentId)) || [];
      requirements.push(text.trim());
      requirementsByDepartment.set(String(departmentId), requirements);
    });

    user.borrowedBooksCount = Number(profile.borrowed_books_count) || 0;
    user.departments = departmentResult.data.map((department) => {
      const id = String(department.department_id ?? department.id ?? '');
      const requirements = requirementsByDepartment.get(String(id)) || [];
      const name = department.name || department.department_name;
      if (!id || !name || !requirements.length) {
        throw new Error('A department is missing its name or requirements.');
      }
      return {
        id,
        name,
        icon: department.icon || '•',
        requirements
      };
    });
    user.requests = mapRequests(requestResult.data || []);
    dataLoaded = true;
  } catch (error) {
    showToast(error.message || 'Your clearance could not be loaded. Refresh and try again.', 'error');
  }

  if (dataLoaded) {
    const getStudentNotifications = () => user.requests
      .filter((request) => ['approved', 'rejected'].includes(request.status) && request.updatedAt)
      .map((request) => {
        const department = user.departments.find((item) => item.id === request.department);
        return {
          id: request.department + ':' + request.updatedAt,
          type: request.status,
          message: (department?.name || 'Department') + ' clearance ' +
            (request.status === 'approved' ? 'approved' : 'needs attention'),
          reason: request.status === 'rejected' ? request.adminNote : '',
          date: request.updatedAt
        };
      })
      .sort((left, right) => String(right.date).localeCompare(String(left.date)));

    const renderRecentNotifications = () => {
      const notifications = getStudentNotifications();
      window.dispatchEvent(new CustomEvent('olopsc:student-notifications', { detail: notifications }));
      const container = document.querySelector('[data-recent-notifications]');
      if (!container) return;
      container.innerHTML = notifications.length
        ? notifications.slice(0, 4).map((notification) =>
          '<div class="notification-row">' +
          '<span class="notification-status ' + (notification.type === 'approved' ? 'notification-approved' : 'notification-rejected') + '">' + (notification.type === 'approved' ? '✓' : '!') + '</span>' +
          '<div><b>' + escapeHtml(notification.message) + '</b>' +
          (notification.reason ? '<small>Reason: ' + escapeHtml(notification.reason) + '</small>' : '') + '</div></div>'
        ).join('')
        : '<div class="empty-state">Your recent clearance updates will appear here.</div>';
    };

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
          '<div class="department-row"><span class="department-symbol">' + escapeHtml(department.icon) + '</span><div class="department-row-main"><b>' + escapeHtml(department.name) + '</b><small>' + (department.id === 'library' ? user.borrowedBooksCount + ' books currently borrowed · ' : '') + (request.validationReason ? 'Needs action · ' + request.validationReason : request.notSubmitted ? 'No request submitted yet' : request.status === 'pending' ? 'Awaiting department review' : request.status === 'approved' ? 'Requirement completed' : 'Action required') + (department.id === 'guidance' ? ' · ' + guidanceSurveyLink : '') + '</small></div>' + statusBadge(request.notSubmitted ? 'not-submitted' : request.status) + '</div>'
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
        const statusText = request.validationReason ? 'Needs action' : request.notSubmitted ? 'Not submitted' : request.status === 'pending' ? 'Submitted for review' : request.status === 'approved' ? 'Approved' : 'Resubmission requested';
        const requirementList = department.requirements.map((requirement) =>
          '<li><span aria-hidden="true">✓</span> ' + escapeHtml(requirement) + '</li>'
        ).join('');
        return '<article class="requirement-item"><div class="requirement-main"><span class="department-symbol">' + escapeHtml(department.icon) + '</span><div class="requirement-copy"><b>' + escapeHtml(department.name) + '</b><small>' + statusText + '</small></div>' + statusBadge(request.notSubmitted ? 'not-submitted' : request.status) + '</div><div class="requirement-details"><ul class="requirement-checklist">' + requirementList + '</ul>' + (department.id === 'guidance' ? guidanceSurveyLink : '') + (department.id === 'library' ? '<p>Currently borrowed: ' + escapeHtml(user.borrowedBooksCount) + ' books.</p>' : '') + '</div>' + (request.adminNote ? '<div class="review-note"><b>Department note:</b> ' + escapeHtml(request.adminNote) + '</div>' : '') + (request.validationReason ? '<div class="review-note"><b>Reason:</b> ' + escapeHtml(request.validationReason) + '</div>' : '') + '</article>';
      }).join('');
      select.innerHTML = '<option value="">Choose a department</option>' +
        user.departments.map((department) => '<option value="' + escapeHtml(department.id) + '">' + escapeHtml(department.name) + '</option>').join('');

      const progress = getProgress(user);
      const progressSummary = document.querySelector('[data-progress-summary]');
      if (progressSummary) {
        progressSummary.textContent = progress.approved + ' of ' + user.departments.length + ' departments approved';
      }
      const ring = document.querySelector('[data-progress-ring]');
      if (ring) {
        ring.style.background = 'conic-gradient(var(--primary) ' + progress.percent + '%, var(--line) ' + progress.percent + '%)';
        ring.querySelector('[data-progress-ring-number]').textContent = progress.percent + '%';
      }
      const copy = document.querySelector('[data-clearance-progress-copy]');
      if (copy) copy.textContent = progress.percent === 100 ? 'Your clearance is complete!' : progress.percent ? 'You’re making good progress' : 'Your clearance is getting started';
      const hint = document.querySelector('[data-requirement-hint]');
      const showSelectedRequirements = (department, request) => {
        if (!department) {
          hint.textContent = 'Select a department to view its requirements.';
          return;
        }
        hint.innerHTML = '<b>Confirm each completed requirement before submitting</b><ul class="requirement-checklist">' +
          department.requirements.map((requirement, index) =>
            '<li><label><input type="checkbox" data-requirement-index="' + index + '"' +
            (request?.completedRequirements?.includes(requirement) ? ' checked' : '') + '> ' +
            escapeHtml(requirement) + '</label></li>'
          ).join('') + '</ul>';
      };
      select.onchange = () => {
        const department = user.departments.find((item) => item.id === select.value);
        const request = department && getRequest(user, department.id);
        showSelectedRequirements(department, request);
        const hasCurrentConfirmation = department &&
          department.requirements.every((requirement) => request.completedRequirements?.includes(requirement));
        if (department && request.status === 'pending' && !request.notSubmitted && hasCurrentConfirmation) {
          hint.insertAdjacentText('afterbegin', 'This request is already with ' + department.name + '. Wait for its review. ');
        } else if (department && request.status === 'pending' && !request.notSubmitted) {
          hint.insertAdjacentText('afterbegin', 'Confirm all current requirements to update this pending request. ');
        } else if (department && request.status === 'approved') {
          hint.insertAdjacentText('afterbegin', 'This request is already approved. No further submission is needed. ');
        }
      };

      const form = document.getElementById('clearance-form');
      if (form.dataset.submitBound === 'true') return;
      form.dataset.submitBound = 'true';
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
        const requirementsConfirmed = department.requirements.every((requirement) => current.completedRequirements?.includes(requirement));
        if (current.status === 'pending' && !current.notSubmitted && requirementsConfirmed) {
          showNotice(notice, 'Your ' + department.name + ' request is already awaiting review.', true);
          return;
        }
        if (current.status === 'approved') {
          showNotice(notice, 'Your ' + department.name + ' request is already approved.', true);
          return;
        }
        const note = document.getElementById('request-note').value.trim();
        const completedRequirements = [...hint.querySelectorAll('[data-requirement-index]:checked')]
          .map((checkbox) => department.requirements[Number(checkbox.dataset.requirementIndex)])
          .filter(Boolean);
        if (completedRequirements.length !== department.requirements.length) {
          showNotice(notice, 'Confirm that you have completed every listed department requirement before submitting.', true);
          return;
        }
        if (note.length > 1000) {
          showNotice(notice, 'Keep your note under 1,000 characters.', true);
          return;
        }

        isSubmitting = true;
        const submitButton = form.querySelector('[type="submit"]');
        submitButton.disabled = true;
        notice.hidden = true;
        try {
          const updatedAt = new Date().toISOString();
          const { error } = await supabaseClient.from('clearance_requests').upsert({
            student_id: profile.id,
            department_id: departmentId,
            status: 'pending',
            student_note: note,
            updated_at: updatedAt
          }, {
            onConflict: 'student_id,department_id'
          });
          if (error) throw error;
          const updated = {
            department: departmentId,
            status: 'pending',
            submittedAt: updatedAt,
            updatedAt,
            attachment: '',
            note,
            adminNote: '',
            validationReason: '',
            completedRequirements,
            notSubmitted: false
          };
          const index = user.requests.findIndex((request) => request.department === departmentId);
          if (index === -1) user.requests.push(updated);
          else user.requests[index] = updated;
          form.reset();
          hint.textContent = 'Select a department to view its requirements.';
          renderDashboard();
          renderClearance();
          renderRecentNotifications();
          showNotice(document.getElementById('clearance-notice'), 'Your ' + department.name + ' request was submitted for review.', false);
        } catch (error) {
          showNotice(notice, error.message || 'Your request could not be submitted. Please try again.', true);
        } finally {
          isSubmitting = false;
          submitButton.disabled = false;
        }
      });
    }

    renderDashboard();
    renderClearance();
    renderRecentNotifications();
    let isRefreshing = false;
    const refreshStudentRequests = async () => {
      if (isRefreshing) return;
      isRefreshing = true;
      try {
        const { data, error } = await supabaseClient
          .from('clearance_requests')
          .select('department_id,status,student_note,admin_feedback,updated_at')
          .eq('student_id', profile.id);
        if (error) throw error;
        user.requests = mapRequests(data || []);
        renderDashboard();
        renderClearance();
        renderRecentNotifications();
      } catch (error) {
        showToast(error.message || 'Your clearance could not be refreshed.', 'error');
      } finally {
        isRefreshing = false;
      }
    };
    window.addEventListener('focus', refreshStudentRequests);
  }
}
