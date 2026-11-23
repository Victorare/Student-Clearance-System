export const SETTINGS_KEY = 'olopsc_clearance_settings_v1';

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',
  fontSize: 'default',
  density: 'comfortable',
  reducedMotion: false,
  sidebarCollapsed: false,
  successNotifications: true,
  infoNotifications: true
});

const VALID_OPTIONS = {
  theme: ['light', 'dark', 'system'],
  fontSize: ['small', 'default', 'large', 'extra-large', 'accessibility'],
  density: ['compact', 'comfortable', 'spacious']
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeSettings(value) {
  const settings = { ...DEFAULT_SETTINGS };
  if (!isRecord(value)) return settings;

  Object.keys(VALID_OPTIONS).forEach((key) => {
    if (VALID_OPTIONS[key].includes(value[key])) settings[key] = value[key];
  });
  ['reducedMotion', 'sidebarCollapsed', 'successNotifications', 'infoNotifications']
    .forEach((key) => {
      if (typeof value[key] === 'boolean') settings[key] = value[key];
    });
  return settings;
}

export function loadSettings() {
  let raw;
  try {
    raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) {
      const oldTheme = localStorage.getItem('olopsc_clearance_theme');
      const migrated = normalizeSettings({ theme: oldTheme === 'dark' ? 'dark' : oldTheme === 'light' ? 'light' : 'system' });
      if (oldTheme !== null) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
        localStorage.removeItem('olopsc_clearance_theme');
      }
      return { settings: migrated, recovered: false };
    }
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, recovered: true };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const settings = { ...DEFAULT_SETTINGS };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      return { settings, recovered: true };
    }
    return { settings, recovered: true };
  }
  const settings = normalizeSettings(parsed);
  const recovered = !isRecord(parsed) || JSON.stringify(parsed) !== JSON.stringify(settings);
  if (recovered) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      return { settings, recovered: true };
    }
  }
  return { settings, recovered };
}

export function saveSettings(settings) {
  try {
    const normalized = normalizeSettings(settings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    throw new Error('Your settings changed, but this browser could not save them.');
  }
}

export function getSettings() {
  return loadSettings().settings;
}
