import { escapeHtml, guardPage, showNotice } from './app.js?v=olopsc-v10';
import {
  friendlyError,
  getRequirementsManagementData,
  saveDepartmentRequirements
} from './demo-store.js?v=olopsc-v9';
import { openModal } from './modal.js?v=olopsc-v4';

const user = await guardPage();
if (user) {
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
  let selectedDepartmentId = '';
  let items = [];
  let savedItems = [];
  let editingIndex = -1;
  let deletingIndex = -1;
  let externalUpdatePending = false;
  let closeEditorModal = null;
  let closeDeleteModal = null;

  const selectedDepartment = () => departments.find((department) => department.id === selectedDepartmentId);
  const isDirty = () => JSON.stringify(items) !== JSON.stringify(savedItems);

  function updateButtons() {
    const department = selectedDepartment();
    const canManage = Boolean(department?.canManage);
    addButton.hidden = !canManage;
    saveButton.disabled = !canManage || !isDirty() || externalUpdatePending;
    discardButton.hidden = !canManage || !isDirty();
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

  function loadData(keepDepartment = true) {
    try {
      const currentDepartmentId = keepDepartment ? selectedDepartmentId : '';
      const data = getRequirementsManagementData();
      externalUpdatePending = false;
      departments = data.departments;
      departmentField.hidden = departments.length <= 1;
      departmentSelect.innerHTML = departments.map((department) =>
        '<option value="' + escapeHtml(department.id) + '">' + escapeHtml(department.name) + '</option>'
      ).join('');
      selectedDepartmentId = departments.some((department) => department.id === currentDepartmentId)
        ? currentDepartmentId
        : departments[0]?.id || '';
      departmentSelect.value = selectedDepartmentId;
      savedItems = [...(data.requirements[selectedDepartmentId] || [])];
      items = [...savedItems];
      renderItems();
    } catch (error) {
      showNotice(notice, friendlyError(error, 'Department requirements could not be loaded.'), true);
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
  saveButton.addEventListener('click', () => {
    if (externalUpdatePending) return;
    try {
      savedItems = saveDepartmentRequirements(selectedDepartmentId, items);
      items = [...savedItems];
      showNotice(notice, 'Requirements saved. Students will see the updated checklist.', false);
      renderItems();
    } catch (error) {
      showNotice(notice, friendlyError(error, 'Requirements could not be saved.'), true);
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== 'olopsc_clearance_demo_requirements') return;
    if (isDirty()) {
      externalUpdatePending = true;
      updateButtons();
      showNotice(notice, 'Requirements changed in another window. Save or discard your draft before reloading.', true);
      return;
    }
    loadData();
  });

  loadData(false);
}
