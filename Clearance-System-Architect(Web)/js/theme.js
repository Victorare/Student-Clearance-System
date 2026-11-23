export function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.classList.toggle('dark-mode', resolved === 'dark');
  root.style.colorScheme = resolved;
  root.style.backgroundColor = resolved === 'dark' ? '#18182a' : '#f6f6fa';
  root.style.color = resolved === 'dark' ? '#e7e7f4' : '#20203f';
  document.body?.style.removeProperty('background-color');
  document.body?.style.removeProperty('color');
  document.body?.classList.toggle('dark-mode', resolved === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', resolved === 'dark' ? '#23233a' : '#0a095f');
  return resolved;
}
