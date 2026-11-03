(function () {
  'use strict';
  const app = window.ClearanceApp;
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    const user = app.getUsers().find((account) => account.username.toLowerCase() === username.toLowerCase() && account.password === password);
    const notice = document.getElementById('login-notice');
    if (!user) {
      app.showNotice(notice, 'We couldn’t sign in with those details. Check your username and password.', true);
      return;
    }
    try {
      localStorage.setItem(app.state.sessionKey, JSON.stringify({ username: user.username, role: user.role, signedInAt: new Date().toISOString() }));
    } catch (error) {
      console.error('Could not save the sign-in session:', error);
      app.showNotice(notice, 'Your browser could not save this session. Check that LocalStorage is enabled.', true);
      return;
    }
    window.location.href = user.role === 'admin' ? 'admin-dashboard.html' : 'student-dashboard.html';
  });

  document.querySelectorAll('[data-fill-user]').forEach((button) => button.addEventListener('click', () => {
    form.elements.username.value = button.dataset.fillUser;
    form.elements.password.value = button.dataset.fillPass;
    form.elements.password.focus();
  }));
  document.querySelector('.password-toggle').addEventListener('click', (event) => {
    const input = form.elements.password;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    event.currentTarget.textContent = reveal ? 'Hide' : 'Show';
    event.currentTarget.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  });
})();
