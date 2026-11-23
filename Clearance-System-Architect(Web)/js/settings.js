import { DEFAULT_SETTINGS, getSettings, saveSettings } from './storage.js';
import { applyTheme } from './theme.js';
import { showToast } from './toast.js';
import { openModal } from './modal.js';

const FONT_SCALES = {
  small: '0.9',
  default: '1',
  large: '1.1',
  'extra-large': '1.25',
  accessibility: '1.4'
};

let settings = { ...DEFAULT_SETTINGS };

function applySettings() {
  const root = document.documentElement;
  applyTheme(settings.theme);
  root.style.setProperty('--font-scale', FONT_SCALES[settings.fontSize]);
  root.dataset.density = settings.density;
  root.dataset.reducedMotion = String(settings.reducedMotion);
  root.classList.toggle('sidebar-collapsed', settings.sidebarCollapsed);
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    const label = root.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    button.setAttribute('aria-label', label);
    button.title = label;
  });
}

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  Object.entries(attributes).forEach(([name, value]) => {
    if (name === 'className') node.className = value;
    else node.setAttribute(name, value);
  });
  if (text) node.textContent = text;
  return node;
}

function createSelect(id, labelText, options, value) {
  const label = element('label', { for: id }, labelText);
  const select = element('select', { id, name: id });
  options.forEach(([optionValue, optionLabel]) => {
    const option = element('option', { value: optionValue }, optionLabel);
    option.selected = optionValue === value;
    select.append(option);
  });
  return [label, select];
}

function createToggle(id, labelText, checked) {
  const settingNames = {
    'setting-motion': 'reducedMotion',
    'setting-sidebar': 'sidebarCollapsed',
    'setting-success-notices': 'successNotifications',
    'setting-info-notices': 'infoNotifications'
  };
  const label = element('label', { className: 'settings-toggle', for: id });
  const input = element('input', { id, name: id, type: 'checkbox' });
  input.dataset.setting = settingNames[id];
  input.checked = checked;
  label.append(input, element('span', {}, labelText));
  return label;
}

function createPanel() {
  const backdrop = element('div', { className: 'modal-backdrop settings-backdrop', 'data-settings-modal': '', hidden: '' });
  const dialog = element('section', {
    className: 'settings-dialog',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'settings-title',
    'aria-describedby': 'settings-description',
    tabindex: '-1'
  });
  const close = element('button', { className: 'modal-close', type: 'button', 'data-settings-close': '', 'aria-label': 'Close settings' }, '×');
  dialog.append(
    close,
    element('span', { className: 'eyebrow' }, 'PREFERENCES'),
    element('h2', { id: 'settings-title' }, 'Settings'),
    element('p', { id: 'settings-description', className: 'settings-intro' }, 'Your preferences save automatically on this device.')
  );

  const form = element('form', { className: 'settings-form' });
  const appearance = element('fieldset', { className: 'settings-group' });
  appearance.append(element('legend', {}, 'Appearance'));
  const theme = createSelect('setting-theme', 'Theme', [
    ['light', 'Light'], ['dark', 'Dark'], ['system', 'System']
  ], settings.theme);
  const font = createSelect('setting-font-size', 'Font size', [
    ['small', 'Small (90%)'], ['default', 'Default (100%)'], ['large', 'Large (110%)'],
    ['extra-large', 'Extra Large (125%)'], ['accessibility', 'Accessibility (140%)']
  ], settings.fontSize);
  const density = createSelect('setting-density', 'Interface density', [
    ['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']
  ], settings.density);
  appearance.append(...theme, ...font, ...density);

  const accessibility = element('fieldset', { className: 'settings-group' });
  accessibility.append(element('legend', {}, 'Accessibility'));
  accessibility.append(
    createToggle('setting-motion', 'Reduce motion', settings.reducedMotion),
    createToggle('setting-sidebar', 'Collapse sidebar on desktop', settings.sidebarCollapsed)
  );

  const notifications = element('fieldset', { className: 'settings-group' });
  notifications.append(element('legend', {}, 'Notifications'));
  notifications.append(
    createToggle('setting-success-notices', 'Show success messages', settings.successNotifications),
    createToggle('setting-info-notices', 'Show information messages', settings.infoNotifications)
  );

  const reset = element('button', { className: 'button button-outline', type: 'button', 'data-settings-reset': '' }, 'Restore default settings');
  form.append(appearance, accessibility, notifications, reset);
  dialog.append(form);
  backdrop.append(dialog);
  document.body.append(backdrop);
  return { backdrop, dialog, form };
}

function persist(nextSettings) {
  const previous = settings;
  settings = { ...settings, ...nextSettings };
  try {
    settings = saveSettings(settings);
    applySettings();
  } catch (error) {
    settings = previous;
    applySettings();
    showToast(error.message, 'error');
    return false;
  }
  return true;
}

export function updateSetting(name, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, name)) return;
  persist({ [name]: value });
}

export function initializeSettings() {
  const loaded = getSettings();
  settings = loaded;
  applySettings();
  const openButton = document.querySelector('[data-settings-open]');
  if (!openButton) {
    if (loaded.recovered) showToast('Some saved preferences were invalid and have been restored.', 'info');
    return;
  }

  const { backdrop, dialog, form } = createPanel();
  const closeButton = dialog.querySelector('[data-settings-close]');
  let closeSettingsModal = null;
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => updateSetting('theme',
      document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  });
  openButton?.addEventListener('click', () => {
    closeSettingsModal = openModal(backdrop, dialog, closeButton);
  });

  const close = () => {
    closeSettingsModal?.();
    closeSettingsModal = null;
  };
  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  form.addEventListener('change', (event) => {
    const target = event.target;
    const keyById = {
      'setting-theme': 'theme',
      'setting-font-size': 'fontSize',
      'setting-density': 'density',
      'setting-motion': 'reducedMotion',
      'setting-sidebar': 'sidebarCollapsed',
      'setting-success-notices': 'successNotifications',
      'setting-info-notices': 'infoNotifications'
    };
    const key = keyById[target.id];
    if (key) persist({ [key]: target.type === 'checkbox' ? target.checked : target.value });
  });
  form.querySelector('[data-settings-reset]').addEventListener('click', () => {
    if (!persist({ ...DEFAULT_SETTINGS })) return;
    form.querySelectorAll('select').forEach((select) => {
      select.value = settings[select.name];
    });
    form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = settings[input.dataset.setting];
    });
    showToast('Default display settings restored.', 'success');
  });

  const preferenceChanged = () => {
    if (settings.theme === 'system') applySettings();
  };
  const colorPreference = window.matchMedia('(prefers-color-scheme: dark)');
  if (colorPreference.addEventListener) colorPreference.addEventListener('change', preferenceChanged);
  else colorPreference.addListener(preferenceChanged);
  window.addEventListener('storage', (event) => {
    if (event.key !== 'olopsc_clearance_settings_v1') return;
    const restored = getSettings();
    settings = restored;
    applySettings();
    form.querySelectorAll('select').forEach((select) => { select.value = settings[select.name]; });
    form.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = settings[input.dataset.setting]; });
  });
  if (loaded.recovered) showToast('Some saved preferences were invalid and have been restored.', 'info');
}
