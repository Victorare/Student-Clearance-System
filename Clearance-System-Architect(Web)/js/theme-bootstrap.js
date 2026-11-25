(function () {
  var theme = 'system';
  var sidebarCollapsed = false;
  var key = 'olopsc_clearance_settings_v1';
  var meta = document.querySelector('meta[name="theme-color"]');

  try {
    var raw = localStorage.getItem(key);
    if (raw) {
      var settings = JSON.parse(raw);
      if (settings && ['light', 'dark', 'system'].indexOf(settings.theme) !== -1) theme = settings.theme;
      sidebarCollapsed = Boolean(settings && settings.sidebarCollapsed === true);
    } else {
      var oldTheme = localStorage.getItem('olopsc_clearance_theme');
      if (oldTheme === 'light' || oldTheme === 'dark') theme = oldTheme;
    }
  } catch {
    theme = 'system';
  }

  var dark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.themeReady = 'false';
  root.classList.toggle('dark-mode', dark);
  root.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.style.backgroundColor = dark ? '#18182a' : '#f6f6fa';
  root.style.color = dark ? '#e7e7f4' : '#20203f';
  if (meta) meta.setAttribute('content', dark ? '#23233a' : '#0a095f');

  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.toggle('dark-mode', dark);
    root.dataset.themeReady = 'true';
  }, { once: true });
}());
