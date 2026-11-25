import { showNotice } from './app.js?v=olopsc-v13';

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
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('We could not verify your account. Please try again.');

    const { data: profile, error: profileError } = await window.supabaseClient
      .schema('public')
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();
    if (profileError) throw profileError;
    if (!profile?.role) throw new Error('We could not find a role for this account.');

    window.location.replace(profile.role.toLowerCase() === 'student'
      ? 'student-dashboard.html'
      : 'admin-dashboard.html');
  } catch (error) {
    setNotice(error.message || 'We could not sign you in. Check your details and try again.', true);
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
