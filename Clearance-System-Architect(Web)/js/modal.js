export function openModal(backdrop, dialog, initialFocus = dialog) {
  const returnFocus = document.activeElement;
  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.hidden = true;
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKeydown);
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
  };

  backdrop.hidden = false;
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  initialFocus?.focus();
  return close;
}
