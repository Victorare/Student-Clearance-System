import { guardPage, showNotice } from './app.js';
import { getSupabaseClient, friendlyError, UserFacingError } from './supabase-client.js';

const existingUser = await guardPage();
if (!existingUser) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const notice = document.getElementById('login-notice');
  const switchButton = document.querySelector('[data-auth-switch]');
  const switchCopy = document.querySelector('[data-auth-switch-copy]');
  const heading = document.querySelector('[data-auth-heading]');
  const copy = document.querySelector('[data-auth-copy]');
  let isRegisterMode = false;

  function setNotice(message, isError = false) {
    showNotice(notice, message, isError);
  }

  function setBusy(form, busy) {
    form.querySelector('[type="submit"]').disabled = busy;
  }

  switchButton.addEventListener('click', () => {
    isRegisterMode = !isRegisterMode;
    notice.hidden = true;
    loginForm.hidden = isRegisterMode;
    registerForm.hidden = !isRegisterMode;
    heading.textContent = isRegisterMode ? 'Create your student account' : 'Welcome to your portal';
    copy.textContent = isRegisterMode
      ? 'Use the one-time registration invitation provided by Student Services.'
      : 'Sign in to manage your clearance requirements.';
    switchCopy.textContent = isRegisterMode ? 'Already registered?' : 'New student?';
    switchButton.textContent = isRegisterMode ? 'Sign in' : 'Create an account';
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    notice.hidden = true;
    const email = loginForm.elements.email.value.trim();
    const password = loginForm.elements.password.value;
    if (!email || !loginForm.elements.email.validity.valid || !password) {
      setNotice('Enter a valid school email and password.', true);
      return;
    }
    setBusy(loginForm, true);
    try {
      const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data: profile, error: profileError } = await getSupabaseClient()
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();
      if (profileError) {
        await getSupabaseClient().auth.signOut();
        throw profileError;
      }
      if (!['Student', 'Admin'].includes(profile.role)) {
        await getSupabaseClient().auth.signOut();
        throw new UserFacingError('This account is not authorized to use the clearance portal.');
      }
      window.location.replace(profile.role === 'Admin' ? 'admin-dashboard.html' : 'student-dashboard.html');
    } catch (error) {
      setNotice(friendlyError(error, 'We could not sign you in. Check your details and try again.'), true);
    } finally {
      setBusy(loginForm, false);
    }
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    notice.hidden = true;
    const email = registerForm.elements.email.value.trim();
    const token = registerForm.elements.invitationToken.value.trim();
    const password = registerForm.elements.password.value;
    const confirmPassword = registerForm.elements.confirmPassword.value;
    if (!registerForm.elements.email.validity.valid || !/^[a-fA-F0-9]{64}$/.test(token)) {
      setNotice('Enter a valid email address and the 64-character invitation token from Student Services.', true);
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setNotice('Choose a password no longer than 72 bytes.', true);
      return;
    }
    if (password.length < 12) {
      setNotice('Choose a password with at least 12 characters.', true);
      return;
    }
    if (password !== confirmPassword) {
      setNotice('The passwords do not match.', true);
      return;
    }

    setBusy(registerForm, true);
    try {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: new URL('login.html', window.location.href).href,
          data: { registration_invite: token.toLowerCase() }
        }
      });
      if (error) throw error;
      if (!data.session) {
        setNotice('Account created. Check your school email to verify it, then sign in.');
      } else {
        window.location.replace('student-dashboard.html');
      }
    } catch (error) {
      setNotice(friendlyError(error, 'We could not create your account. Check the invitation and try again.'), true);
    } finally {
      setBusy(registerForm, false);
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
