import { guardPage, showNotice } from './app.js';
import { isStaffRole } from './roles.js';
import { friendlyError, signIn } from './demo-store.js';

const existingUser = await guardPage();
if (!existingUser) {
  const loginForm = document.getElementById('login-form');
  const notice = document.getElementById('login-notice');

  function setNotice(message, isError = false) {
    showNotice(notice, message, isError);
  }

  function setBusy(form, busy) {
    form.querySelector('[type="submit"]').disabled = busy;
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    notice.hidden = true;
    const email = loginForm.elements.username.value.trim();
    const password = loginForm.elements.password.value;
    if (!email || !loginForm.elements.username.validity.valid || !password) {
      setNotice('Enter a valid school email and password.', true);
      return;
    }
    setBusy(loginForm, true);
    try {
      const user = signIn(email, password);
      if (user.role !== 'student' && !isStaffRole(user.role)) {
        throw new Error('This account is not authorized to use the clearance portal.');
      }
      window.location.replace(user.role === 'student' ? 'student-dashboard.html' : 'admin-dashboard.html');
    } catch (error) {
      setNotice(friendlyError(error, 'We could not sign you in. Check your details and try again.'), true);
    } finally {
      setBusy(loginForm, false);
    }
  });

  document.querySelector('.password-toggle').addEventListener('click', (event) => {
    const input = loginForm.elements.password;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    event.currentTarget.textContent = reveal ? 'Hide' : 'Show';
    event.currentTarget.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  });
}
