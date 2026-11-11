let toastRegion;

export function showToast(message, type = 'info') {
  if (!toastRegion) {
    toastRegion = document.createElement('div');
    toastRegion.className = 'toast-region';
    document.body.append(toastRegion);
  }
  toastRegion.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => {
    toast.remove();
    if (!toastRegion.childElementCount) {
      toastRegion.remove();
      toastRegion = null;
    }
  }, 4500);
}
