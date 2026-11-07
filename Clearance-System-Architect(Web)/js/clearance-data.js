import { getSupabaseClient, friendlyError, UserFacingError } from './supabase-client.js';

const DOCUMENT_BUCKET = 'clearance-documents';
const MAX_FILE_SIZE = 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']);

function assertResult({ data, error }) {
  if (error) throw new UserFacingError(friendlyError(error));
  return data;
}

export async function getProfile(userId) {
  const result = await getSupabaseClient().from('profiles')
    .select('id,email,role,full_name,student_id,program,academic_year')
    .eq('id', userId)
    .single();
  return assertResult(result);
}

export async function getDepartments() {
  const result = await getSupabaseClient().from('departments')
    .select('department_id,name,requirement')
    .order('name');
  return assertResult(result);
}

export async function getStudentClearance(studentId) {
  const result = await getSupabaseClient().from('clearance_requests')
    .select('request_id,student_id,department_id,status,feedback_notes,submission_timestamp,reviewed_at,attachment_path')
    .eq('student_id', studentId);
  return assertResult(result);
}

function validateDocument(file) {
  if (!file) return;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (file.size > MAX_FILE_SIZE) throw new UserFacingError('Choose a supporting document smaller than 1 MB.');
  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_TYPES.has(file.type)) {
    throw new UserFacingError('Choose a PDF, JPG, PNG, DOC, or DOCX document.');
  }
}

export async function submitClearanceRequest({ studentId, departmentId, feedbackNotes, file }) {
  validateDocument(file);
  let attachmentPath = null;
  if (file) {
    const extension = file.name.split('.').pop().toLowerCase();
    attachmentPath = `${studentId}/${crypto.randomUUID()}.${extension}`;
    const upload = await getSupabaseClient().storage.from(DOCUMENT_BUCKET).upload(attachmentPath, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false
    });
    assertResult(upload);
  }

  const result = await getSupabaseClient().rpc('submit_clearance_request', {
    p_department_id: departmentId,
    p_feedback_notes: feedbackNotes,
    p_attachment_path: attachmentPath
  });
  if (!result.error) return result.data;

  if (attachmentPath) {
    const cleanup = await getSupabaseClient().storage.from(DOCUMENT_BUCKET).remove([attachmentPath]);
    if (cleanup.error) {
      throw new UserFacingError('Your request was not saved, and its temporary document could not be removed. Contact Student Services.');
    }
  }
  throw new UserFacingError(friendlyError(result.error, 'Your clearance request could not be saved. Please try again.'));
}

async function loadAdminRequests(status) {
  let query = getSupabaseClient().from('clearance_requests')
    .select('request_id,student_id,department_id,status,feedback_notes,submission_timestamp,attachment_path,profiles!clearance_requests_student_id_fkey(full_name,student_id,program),departments(name)')
    .order('submission_timestamp', { ascending: false });
  if (status) query = query.eq('status', status);
  const result = await query;
  const rows = assertResult(result);
  return Promise.all(rows.map(async (row) => {
    let attachmentUrl = null;
    if (row.attachment_path) {
      const signed = await getSupabaseClient().storage.from(DOCUMENT_BUCKET).createSignedUrl(row.attachment_path, 60 * 5);
      if (signed.error) throw new UserFacingError('A supporting document could not be opened. Refresh and try again.');
      attachmentUrl = signed.data.signedUrl;
    }
    return {
      ...row,
      student: row.profiles,
      department: row.departments,
      attachmentUrl
    };
  }));
}

export async function getAdminRequests() {
  return loadAdminRequests();
}

export async function getPendingClearanceRequests() {
  return loadAdminRequests('Pending');
}

export async function getAdminStudentCount() {
  const result = await getSupabaseClient().from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'Student');
  assertResult(result);
  return result.count || 0;
}

export async function getAdminStatusCounts() {
  const result = await getSupabaseClient().rpc('admin_clearance_counts');
  const rows = assertResult(result);
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.request_count)]));
}

export async function reviewClearanceRequest({ requestId, action, feedbackNotes = '' }) {
  const result = await getSupabaseClient().rpc('review_clearance_request', {
    p_request_id: requestId,
    p_action: action,
    p_feedback_notes: feedbackNotes
  });
  return assertResult(result);
}
