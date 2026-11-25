// supabase-client.js
const SUPABASE_URL = 'https://prkyhvkmwthyvdqhwxbc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2prPE7BwsqzybF4UOvJPdw_muG_BFFu';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient;

// Shared auth & profile helper used across all pages
async function requireAuth(allowedRoles = null) {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    window.location.href = 'login.html';
    return null;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }

  const role = String(profile.role || '').toLowerCase();
  if (allowedRoles && !allowedRoles.includes(role)) {
    window.location.href = role === 'student' ? 'student-dashboard.html' : 'admin-dashboard.html';
    return null;
  }

  return { session, profile };
}
window.requireAuth = requireAuth;

window.handleSignOut = async function handleSignOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
  window.location.href = 'login.html';
};