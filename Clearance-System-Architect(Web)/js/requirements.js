import { applyUser, escapeHtml, showNotice, toAppUser } from './app.js?v=olopsc-v13';
import { openModal } from './modal.js?v=olopsc-v4';

const allowedRoles = ['dean', 'registrar', 'clinic', 'library', 'guidance', 'accounting', 'faculty', 'super_admin'];
const auth = await requireAuth(allowedRoles);
if (auth) {
  const profile = auth.profile;
  applyUser(profile);
  const user = toAppUser(profile);
  const isSuperAdmin = user.role === 'super_admin';
  const notice = document.querySelector('#requirements-notice');
  const departmentField = document.querySelector('[data-department-field]');
  const departmentSelect = document.querySelector('[data-requirements-department]');
  const title = document.querySelector('[data-requirements-department-title]');
  const access = document.querySelector('[data-requirements-access]');
  const list = document.querySelector('[data-requirement-manager-list]');
  const count = document.querySelector('[data-requirement-count]');
  const addButton = document.querySelector('[data-add-requirement]');
  const saveButton = document.querySelector('[data-save-requirements]');
  const discardButton = document.querySelector('[data-discard-requirements]');
  const editorBackdrop = document.querySelector('[data-requirement-editor-backdrop]');
  const editorForm = document.querySelector('[data-requirement-editor-form]');
  const editorInput = document.querySelector('#requirement-editor-input');
  const editorTitle = document.querySelector('#requirement-editor-title');
  const deleteBackdrop = document.querySelector('[data-requirement-delete-backdrop]');
  const deleteCopy = document.querySelector('[data-requirement-delete-copy]');
  let departments = [];
  let scopedDepartmentIds = [];
  let selectedDepartmentId = '';
  let items = [];
  let savedItems = [];
  let savedRows = [];
  let requirementTextColumn = 'requirement_text';
  let requirementIdColumn = 'id';
  let editingIndex = -1;
  let deletingIndex = -1;
  let externalUpdatePending = false;
  let isLoading = false;
  let isSaving = false;
  let closeEditorModal = null;
  let closeDeleteModal = null;

  const selectedDepartment = () => departments.find((department) => department.id === selectedDepartmentId);
  const isDirty = () => JSON.stringify(items) !== JSON.stringify(savedItems);

  function updateButtons() {
    const department = selectedDepartment();
    const canManage = Boolean(department?.canManage);
    addButton.hidden = !canManage;
    saveButton.disabled = !canManage || !isDirty() || externalUpdatePending || isLoading || isSaving;
    discardButton.hidden = !canManage || !isDirty();
    discardButton.disabled = isLoading || isSaving;
    departmentSelect.disabled = canManage && isDirty();
  }

  function renderItems() {
    const department = selectedDepartment();
    if (!department) return;
    title.textContent = department.name + ' requirements';
    access.textContent = department.canManage
      ? 'You can edit requirements for this department only.'
      : 'View-only access. Requirement changes are managed by the department team.';
    count.textContent = items.length + (items.length === 1 ? ' requirement' : ' requirements');
    list.innerHTML = items.length
      ? items.map((item, index) =>
        '<article class="requirement-manager-row"><span class="department-symbol">✓</span><p>' + escapeHtml(item) +
        '</p>' + (department.canManage
          ? '<div class="requirement-manager-actions"><button class="action-button" type="button" data-edit-requirement="' + index + '">Edit</button><button class="action-button reject" type="button" data-delete-requirement="' + index + '">Delete</button></div>'
          : '') + '</article>'
      ).join('')
      : '<div class="empty-state">No requirements are currently listed.</div>';
    updateButtons();
  }

  async function loadData(keepDepartment = true) {
    if (isLoading) return;
    isLoading = true;
    try {
      const currentDepartmentId = keepDepartment ? selectedDepartmentId : '';
      let departmentQuery = supabaseClient.from('departments').select('*');
      if (!isSuperAdmin) departmentQuery = departmentQuery.eq('owner_role', user.role);
      const { data: departmentRows, error: departmentError } = await departmentQuery;
      if (departmentError) throw departmentError;
      departments = (departmentRows || []).map((department) => ({
        ...department,
        id: String(department.department_id ?? department.id ?? ''),
        name: department.name || department.department_name,
        canManage: true
      }));
      if (!departments.length || departments.some((department) => !department.id || !department.name)) {
        throw new Error('No valid departments are assigned to this role.');
      }

      scopedDepartmentIds = departments.map((department) => department.id);
      const { data: requirementRows, error: requirementError } = await supabaseClient
        .from('department_requirements')
        .select('*')
        .in('department_id', scopedDepartmentIds);
      if (requirementError) throw requirementError;

      const rows = requirementRows || [];
      const columns = ['requirement_text', 'requirement', 'description', 'requirement_name', 'name', 'text'];
      requirementTextColumn = columns.find((column) =>
        rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))
      ) || 'requirement_text';
      requirementIdColumn = rows.some((row) => row.id != null)
        ? 'id'
        : rows.some((row) => row.requirement_id != null)
          ? 'requirement_id'
          : 'id';
      if (rows.some((row) => row[requirementIdColumn] == null || typeof row[requirementTextColumn] !== 'string')) {
        throw new Error('A department requirement is missing its record ID or text.');
      }

      externalUpdatePending = false;
      departmentField.hidden = departments.length <= 1;
      departmentSelect.innerHTML = departments.map((department) =>
        '<option value="' + escapeHtml(department.id) + '">' + escapeHtml(department.name) + '</option>'
      ).join('');
      selectedDepartmentId = departments.some((department) => department.id === currentDepartmentId)
        ? currentDepartmentId
        : departments[0]?.id || '';
      departmentSelect.value = selectedDepartmentId;
      savedRows = rows
        .filter((row) => String(row.department_id) === selectedDepartmentId)
        .map((row) => ({ id: row[requirementIdColumn], text: row[requirementTextColumn] }));
      savedItems = savedRows.map((row) => row.text);
      items = [...savedItems];
      renderItems();
      return true;
    } catch (error) {
      showNotice(notice, error.message || 'Department requirements could not be loaded.', true);
      return false;
    } finally {
      isLoading = false;
      updateButtons();
    }
  }

  function validateItems() {
    if (!Array.isArray(items) || items.length < 1 || items.length > 30 ||
        items.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > 250)) {
      throw new Error('Add between 1 and 30 requirements, each under 250 characters.');
    }
    const normalized = items.map((item) => item.trim());
    if (new Set(normalized.map((item) => item.toLocaleLowerCase())).size !== normalized.length) {
      throw new Error('Each requirement must be unique.');
    }
    return normalized;
  }

  async function saveRequirementRows() {
    const normalizedItems = validateItems();
    const departmentId = selectedDepartmentId;
    if (!scopedDepartmentIds.includes(departmentId)) {
      throw new Error('The department is outside your role scope.');
    }
    const sharedScope = (query) => query
      .eq('department_id', departmentId)
      .in('department_id', scopedDepartmentIds);
    const updateCount = Math.min(savedRows.length, normalizedItems.length);

    for (let index = 0; index < updateCount; index += 1) {
      if (savedRows[index].text === normalizedItems[index]) continue;
      const { data, error } = await sharedScope(supabaseClient
        .from('department_requirements')
        .update({ [requirementTextColumn]: normalizedItems[index] })
        .eq(requirementIdColumn, savedRows[index].id))
        .select(requirementIdColumn)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A requirement could not be updated in your department scope.');
    }

    for (const row of savedRows.slice(normalizedItems.length)) {
      const { data, error } = await sharedScope(supabaseClient
        .from('department_requirements')
        .delete()
        .eq(requirementIdColumn, row.id))
        .select(requirementIdColumn);
      if (error) throw error;
      if (!data?.length) throw new Error('A requirement could not be deleted in your department scope.');
    }

    for (const text of normalizedItems.slice(savedRows.length)) {
      const { error } = await supabaseClient.from('department_requirements').insert({
        department_id: departmentId,
        [requirementTextColumn]: text
      });
      if (error) throw error;
    }
  }

  function closeEditor() {
    closeEditorModal?.();
    closeEditorModal = null;
    editorForm.reset();
    editingIndex = -1;
  }

  function openEditor(index = -1) {
    editingIndex = index;
    editorTitle.textContent = index < 0 ? 'Add requirement' : 'Edit requirement';
    editorInput.value = index < 0 ? '' : items[index];
    closeEditorModal = openModal(editorBackdrop, editorBackdrop.querySelector('.reject-dialog'), editorInput);
  }

  function closeDelete() {
    closeDeleteModal?.();
    closeDeleteModal = null;
    deletingIndex = -1;
  }

  function openDelete(index) {
    deletingIndex = index;
    deleteCopy.textContent = '“' + items[index] + '” will be removed from the draft. Save your changes to apply this update to student clearance pages.';
    closeDeleteModal = openModal(deleteBackdrop, deleteBackdrop.querySelector('.reject-dialog'));
  }

  departmentSelect.addEventListener('change', () => {
    if (isDirty()) {
      departmentSelect.value = selectedDepartmentId;
      showNotice(notice, 'Save or discard your unsaved changes before switching departments.', true);
      return;
    }
    selectedDepartmentId = departmentSelect.value;
    notice.hidden = true;
    loadData();
  });

  list.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-requirement]');
    const remove = event.target.closest('[data-delete-requirement]');
    if (edit) openEditor(Number(edit.dataset.editRequirement));
    if (remove) openDelete(Number(remove.dataset.deleteRequirement));
  });

  addButton.addEventListener('click', () => openEditor());
  editorForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = editorInput.value.trim();
    if (!value) {
      editorInput.setCustomValidity('Enter a requirement.');
      editorInput.reportValidity();
      return;
    }
    editorInput.setCustomValidity('');
    if (editingIndex < 0) items.push(value);
    else items[editingIndex] = value;
    closeEditor();
    notice.hidden = true;
    renderItems();
  });
  editorInput.addEventListener('input', () => editorInput.setCustomValidity(''));

  document.querySelectorAll('[data-close-requirement-editor]').forEach((button) =>
    button.addEventListener('click', closeEditor)
  );
  editorBackdrop.addEventListener('click', (event) => {
    if (event.target === editorBackdrop) closeEditor();
  });
  document.querySelectorAll('[data-cancel-requirement-delete]').forEach((button) =>
    button.addEventListener('click', closeDelete)
  );
  deleteBackdrop.addEventListener('click', (event) => {
    if (event.target === deleteBackdrop) closeDelete();
  });
  document.querySelector('[data-confirm-requirement-delete]').addEventListener('click', () => {
    if (deletingIndex < 0) return;
    items.splice(deletingIndex, 1);
    closeDelete();
    renderItems();
  });

  discardButton.addEventListener('click', () => {
    if (externalUpdatePending) {
      loadData();
      notice.hidden = true;
      return;
    }
    items = [...savedItems];
    notice.hidden = true;
    renderItems();
  });
  saveButton.addEventListener('click', async () => {
    if (externalUpdatePending) return;
    isSaving = true;
    updateButtons();
    try {
      await saveRequirementRows();
      if (!await loadData()) return;
      showNotice(notice, 'Requirements saved. Students will see the updated checklist.', false);
    } catch (error) {
      showNotice(notice, error.message || 'Requirements could not be saved.', true);
    } finally {
      isSaving = false;
      updateButtons();
    }
  });
  window.addEventListener('focus', () => {
    if (document.hidden || isLoading || isSaving) return;
    if (isDirty()) {
      externalUpdatePending = true;
      updateButtons();
      showNotice(notice, 'Requirements may have changed elsewhere. Save or discard your draft before reloading.', true);
      return;
    }
    loadData();
  });

  loadData(false);
}
