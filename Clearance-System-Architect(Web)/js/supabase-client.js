import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://prkyhvkmwthyvdqhwxbc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2prPE7BwsqzybF4UOvJPdw_muG_BFFu';
let client;

export class UserFacingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export function getSupabaseClient() {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) ||
      SUPABASE_ANON_KEY.includes('YOUR_') || SUPABASE_ANON_KEY.startsWith('your-')) {
    throw new UserFacingError('Supabase is not configured yet. Add a valid project URL and publishable key, then refresh.');
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
  }
  return client;
}

export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof UserFacingError) return error.message;
  const message = String(error?.message || '').toLowerCase();
  const code = error?.code;
  if (code === '23505' || message.includes('already registered') || message.includes('already exists')) {
    return 'That email or student record is already in use.';
  }
  if (message.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (message.includes('email not confirmed')) return 'Please verify your email before signing in.';
  if (message.includes('database error saving new user')) return 'We could not verify that invitation. Check the token or ask Student Services for help.';
  if (message.includes('password should be at least') || message.includes('weak_password')) {
    return 'Choose a stronger password with at least 12 characters.';
  }
  if (message.includes('registration invitation') || message.includes('invitation')) {
    return 'That school registration invitation is invalid, expired, or already used.';
  }
  if (message.includes('already pending') || message.includes('not pending')) {
    return 'This request has already changed. Refresh the page and try again.';
  }
  if (message.includes('feedback is required')) return 'Add feedback before rejecting this request.';
  if (message.includes('administrator access')) return 'You do not have permission to do that.';
  if (message.includes('payload too large') || message.includes('file size')) return 'Choose a supporting document smaller than 1 MB.';
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'We could not connect to the service. Check your internet connection and try again.';
  }
  if (error?.name === 'AuthWeakPasswordError') return 'Choose a stronger password with at least 12 characters.';
  return fallback;
}
