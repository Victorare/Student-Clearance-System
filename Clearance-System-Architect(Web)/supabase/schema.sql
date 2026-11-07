BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname = 'pgcrypto' AND n.nspname = 'extensions'
    ) THEN
        ALTER EXTENSION pgcrypto SET SCHEMA extensions;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'Student' CHECK (role IN ('Student', 'Admin')),
    full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 120),
    student_id TEXT UNIQUE,
    program TEXT,
    academic_year TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (role = 'Student' AND student_id IS NOT NULL AND program IS NOT NULL AND academic_year IS NOT NULL)
        OR
        (role = 'Admin' AND student_id IS NULL AND program IS NULL AND academic_year IS NULL)
    )
);

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS student_id TEXT,
    ADD COLUMN IF NOT EXISTS program TEXT,
    ADD COLUMN IF NOT EXISTS academic_year TEXT;

UPDATE public.profiles AS profile
SET full_name = coalesce(
        nullif(btrim(profile.full_name), ''),
        nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
        split_part(profile.email, '@', 1)
    ),
    email = lower(profile.email)
FROM auth.users AS auth_user
WHERE auth_user.id = profile.id
  AND (profile.full_name IS NULL OR btrim(profile.full_name) = '' OR profile.email <> lower(profile.email));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_student_id_unique_idx
    ON public.profiles (student_id)
    WHERE student_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.registration_invites (
    invite_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    student_id TEXT NOT NULL,
    full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 120),
    program TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registration_invites_student_idx
    ON public.registration_invites (student_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.departments (
    department_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    requirement TEXT NOT NULL
);

INSERT INTO public.departments (department_id, name, requirement) VALUES
    ('library', 'Library', 'Return all borrowed books and settle any outstanding library fees.'),
    ('accounting', 'Accounting', 'Settle outstanding tuition, fees, or payment arrangements.'),
    ('laboratory', 'Laboratory', 'Return borrowed equipment and settle laboratory charges.'),
    ('registrar', 'Registrar', 'Confirm academic records and submit any required forms.'),
    ('student-affairs', 'Student Affairs', 'Complete student organization and conduct requirements.')
ON CONFLICT (department_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.clearance_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    department_id TEXT NOT NULL REFERENCES public.departments(department_id),
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    feedback_notes TEXT NOT NULL DEFAULT '' CHECK (length(feedback_notes) <= 1000),
    submission_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ,
    attachment_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, department_id),
    CHECK (attachment_path IS NULL OR attachment_path LIKE (student_id::text || '/%'))
);

ALTER TABLE public.clearance_requests
    ADD COLUMN IF NOT EXISTS request_id UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS department_id TEXT,
    ADD COLUMN IF NOT EXISTS feedback_notes TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS submission_timestamp TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS reviewed_by UUID,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attachment_path TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.clearance_requests AS request
SET request_id = coalesce(request.request_id, gen_random_uuid()),
    department_id = coalesce(
        request.department_id,
        CASE lower(btrim(coalesce(request.department, '')))
            WHEN 'library' THEN 'library'
            WHEN 'accounting' THEN 'accounting'
            WHEN 'laboratory' THEN 'laboratory'
            WHEN 'lab' THEN 'laboratory'
            WHEN 'registrar' THEN 'registrar'
            WHEN 'student affairs' THEN 'student-affairs'
            WHEN 'student-affairs' THEN 'student-affairs'
            ELSE coalesce(nullif(regexp_replace(lower(btrim(request.department)), '[^a-z0-9]+', '-', 'g'), ''), 'other')
        END
    ),
    feedback_notes = coalesce(request.feedback_notes, request.notes, ''),
    submission_timestamp = coalesce(request.submission_timestamp, request.updated_at, now()),
    created_at = coalesce(request.created_at, request.updated_at, now()),
    status = CASE lower(coalesce(request.status, 'pending'))
        WHEN 'approved' THEN 'Approved'
        WHEN 'rejected' THEN 'Rejected'
        ELSE 'Pending'
    END;

INSERT INTO public.departments (department_id, name, requirement)
SELECT DISTINCT
    request.department_id,
    coalesce(nullif(btrim(request.department), ''), initcap(replace(request.department_id, '-', ' '))),
    'Contact this department for clearance requirements.'
FROM public.clearance_requests AS request
WHERE NOT EXISTS (
    SELECT 1 FROM public.departments AS department
    WHERE department.department_id = request.department_id
)
ON CONFLICT (department_id) DO NOTHING;

ALTER TABLE public.clearance_requests
    ALTER COLUMN request_id SET NOT NULL,
    ALTER COLUMN department_id SET NOT NULL,
    ALTER COLUMN feedback_notes SET DEFAULT '',
    ALTER COLUMN feedback_notes SET NOT NULL,
    ALTER COLUMN submission_timestamp SET DEFAULT now(),
    ALTER COLUMN submission_timestamp SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'Pending',
    ALTER COLUMN status SET NOT NULL;

DO $$
DECLARE
    status_check RECORD;
BEGIN
    FOR status_check IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.clearance_requests'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE public.clearance_requests DROP CONSTRAINT %I', status_check.conname);
    END LOOP;

    ALTER TABLE public.clearance_requests
        ADD CONSTRAINT clearance_requests_status_check
        CHECK (status IN ('Pending', 'Approved', 'Rejected'));

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.clearance_requests'::regclass
          AND conname = 'clearance_requests_request_id_key'
    ) THEN
        ALTER TABLE public.clearance_requests
            ADD CONSTRAINT clearance_requests_request_id_key UNIQUE (request_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.clearance_requests'::regclass
          AND conname = 'clearance_requests_department_id_fkey'
    ) THEN
        ALTER TABLE public.clearance_requests
            ADD CONSTRAINT clearance_requests_department_id_fkey
            FOREIGN KEY (department_id) REFERENCES public.departments(department_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.clearance_requests'::regclass
          AND conname = 'clearance_requests_student_id_fkey'
    ) THEN
        ALTER TABLE public.clearance_requests
            ADD CONSTRAINT clearance_requests_student_id_fkey
            FOREIGN KEY (student_id) REFERENCES public.profiles(id);
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS clearance_requests_student_department_unique_idx
    ON public.clearance_requests (student_id, department_id);

CREATE INDEX IF NOT EXISTS clearance_requests_status_timestamp_idx
    ON public.clearance_requests (status, submission_timestamp DESC);
CREATE INDEX IF NOT EXISTS clearance_requests_student_timestamp_idx
    ON public.clearance_requests (student_id, submission_timestamp DESC);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    target_student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    request_id UUID NOT NULL REFERENCES public.clearance_requests(request_id) ON DELETE RESTRICT,
    department_id TEXT NOT NULL REFERENCES public.departments(department_id),
    action TEXT NOT NULL CHECK (action IN ('Approved', 'Rejected')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_occurred_at_idx
    ON public.audit_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_target_timestamp_idx
    ON public.audit_logs (target_student_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Audit log records cannot be changed or deleted';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();
DROP TRIGGER IF EXISTS audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER audit_logs_no_truncate
    BEFORE TRUNCATE ON public.audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_audit_log_mutation();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role = 'Admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.prepare_auth_user_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    invite public.registration_invites%ROWTYPE;
    invite_token TEXT;
BEGIN
    IF NEW.raw_app_meta_data ->> 'role' = 'Admin' THEN
        NEW.raw_user_meta_data := coalesce(NEW.raw_user_meta_data, '{}'::jsonb) - 'registration_invite' - 'verified_student';
        RETURN NEW;
    END IF;

    invite_token := NEW.raw_user_meta_data ->> 'registration_invite';

    IF invite_token IS NULL OR invite_token !~ '^[a-fA-F0-9]{64}$' THEN
        RAISE EXCEPTION 'A valid school registration invitation is required';
    END IF;

    SELECT *
    INTO invite
    FROM public.registration_invites
    WHERE token_hash = encode(extensions.digest(convert_to(lower(invite_token), 'UTF8'), 'sha256'), 'hex')
      AND claimed_at IS NULL
      AND expires_at > now()
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The school registration invitation is invalid, expired, or already used';
    END IF;

    NEW.raw_user_meta_data := (
        coalesce(NEW.raw_user_meta_data, '{}'::jsonb) - 'registration_invite' - 'verified_student'
    ) || jsonb_build_object(
        'verified_student',
        jsonb_build_object(
            'student_id', invite.student_id,
            'full_name', invite.full_name,
            'program', invite.program,
            'academic_year', invite.academic_year
        )
    );
    UPDATE public.registration_invites SET claimed_at = now() WHERE invite_id = invite.invite_id;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_student_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    verified_student JSONB;
BEGIN
    IF NEW.raw_app_meta_data ->> 'role' = 'Admin' THEN
        INSERT INTO public.profiles (id, email, role, full_name)
        VALUES (
            NEW.id,
            lower(NEW.email),
            'Admin',
            coalesce(nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), split_part(NEW.email, '@', 1))
        );
        RETURN NEW;
    END IF;

    verified_student := NEW.raw_user_meta_data -> 'verified_student';
    IF verified_student IS NULL THEN
        RAISE EXCEPTION 'A valid school registration invitation is required';
    END IF;

    INSERT INTO public.profiles (id, email, role, full_name, student_id, program, academic_year)
    VALUES (
        NEW.id,
        lower(NEW.email),
        'Student',
        verified_student ->> 'full_name',
        verified_student ->> 'student_id',
        verified_student ->> 'program',
        verified_student ->> 'academic_year'
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_prepare_registration ON auth.users;
CREATE TRIGGER on_auth_user_prepare_registration
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.prepare_auth_user_registration();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_student_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_student_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.create_student_profile();

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.profiles SET email = lower(NEW.email) WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
    AFTER UPDATE OF email ON auth.users
    FOR EACH ROW
    WHEN (OLD.email IS DISTINCT FROM NEW.email)
    EXECUTE FUNCTION public.sync_profile_email();

CREATE OR REPLACE FUNCTION public.submit_clearance_request(
    p_department_id TEXT,
    p_feedback_notes TEXT DEFAULT '',
    p_attachment_path TEXT DEFAULT NULL
)
RETURNS public.clearance_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result public.clearance_requests%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Student'
    ) THEN
        RAISE EXCEPTION 'Only signed-in students may submit requests';
    END IF;
    IF p_feedback_notes IS NULL OR length(p_feedback_notes) > 1000 THEN
        RAISE EXCEPTION 'Notes must be 1000 characters or fewer';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.departments WHERE department_id = p_department_id) THEN
        RAISE EXCEPTION 'The selected department was not found';
    END IF;
    IF p_attachment_path IS NOT NULL AND p_attachment_path NOT LIKE auth.uid()::text || '/%' THEN
        RAISE EXCEPTION 'Invalid attachment path';
    END IF;

    INSERT INTO public.clearance_requests
        (student_id, department, notes, department_id, status, feedback_notes, submission_timestamp,
         reviewed_by, reviewed_at, attachment_path, updated_at)
    SELECT
        auth.uid(), departments.name, p_feedback_notes, p_department_id, 'Pending', p_feedback_notes,
        now(), NULL, NULL, p_attachment_path, now()
    FROM public.departments
    WHERE departments.department_id = p_department_id
    ON CONFLICT (student_id, department_id) DO UPDATE
        SET department = EXCLUDED.department,
            notes = EXCLUDED.notes,
            status = 'Pending',
            feedback_notes = EXCLUDED.feedback_notes,
            submission_timestamp = now(),
            reviewed_by = NULL,
            reviewed_at = NULL,
            attachment_path = EXCLUDED.attachment_path,
            updated_at = now()
        WHERE public.clearance_requests.status = 'Rejected'
    RETURNING * INTO result;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A request for this department is already pending or approved';
    END IF;

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_clearance_request(
    p_request_id UUID,
    p_action TEXT,
    p_feedback_notes TEXT DEFAULT ''
)
RETURNS public.clearance_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    result public.clearance_requests%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'
    ) THEN
        RAISE EXCEPTION 'Administrator access is required';
    END IF;
    IF p_action NOT IN ('Approved', 'Rejected') THEN
        RAISE EXCEPTION 'Choose Approved or Rejected';
    END IF;
    IF p_feedback_notes IS NULL OR length(p_feedback_notes) > 1000 THEN
        RAISE EXCEPTION 'Feedback must be 1000 characters or fewer';
    END IF;
    IF p_action = 'Rejected' AND length(btrim(p_feedback_notes)) = 0 THEN
        RAISE EXCEPTION 'Feedback is required when rejecting a request';
    END IF;

    UPDATE public.clearance_requests
    SET status = p_action,
        notes = p_feedback_notes,
        feedback_notes = p_feedback_notes,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    WHERE request_id = p_request_id AND status = 'Pending'
    RETURNING * INTO result;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'This request is not pending or no longer exists';
    END IF;

    INSERT INTO public.audit_logs
        (admin_id, target_student_id, request_id, department_id, action)
    VALUES
        (auth.uid(), result.student_id, result.request_id, result.department_id, p_action);

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clearance_counts()
RETURNS TABLE(status TEXT, request_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'
    ) THEN
        RAISE EXCEPTION 'Administrator access is required';
    END IF;

    RETURN QUERY
    SELECT statuses.status, count(requests.request_id)
    FROM (VALUES ('Pending'), ('Approved'), ('Rejected')) AS statuses(status)
    LEFT JOIN public.clearance_requests AS requests ON requests.status = statuses.status
    GROUP BY statuses.status;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clearance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_read_self_or_admin ON public.profiles;
CREATE POLICY profiles_read_self_or_admin ON public.profiles
    FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS departments_read_authenticated ON public.departments;
CREATE POLICY departments_read_authenticated ON public.departments
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS clearance_read_self_or_admin ON public.clearance_requests;
CREATE POLICY clearance_read_self_or_admin ON public.clearance_requests
    FOR SELECT TO authenticated
    USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS audit_read_admin ON public.audit_logs;
CREATE POLICY audit_read_admin ON public.audit_logs
    FOR SELECT TO authenticated
    USING ((SELECT public.is_admin()));

REVOKE ALL ON public.profiles, public.registration_invites, public.departments,
    public.clearance_requests, public.audit_logs FROM anon, authenticated;

GRANT SELECT ON public.profiles, public.departments, public.clearance_requests TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.prepare_auth_user_registration() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_student_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_clearance_request(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_clearance_request(TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.review_clearance_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_clearance_request(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_clearance_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clearance_counts() TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'clearance-documents',
    'clearance-documents',
    false,
    1048576,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 1048576,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS clearance_files_read_owner_or_admin ON storage.objects;
CREATE POLICY clearance_files_read_owner_or_admin ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'clearance-documents'
        AND (
            (storage.foldername(name))[1] = (SELECT auth.uid())::text
            OR (SELECT public.is_admin())
        )
    );

DROP POLICY IF EXISTS clearance_files_insert_owner ON storage.objects;
CREATE POLICY clearance_files_insert_owner ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'clearance-documents'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'Student')
    );

DROP POLICY IF EXISTS clearance_files_delete_owner ON storage.objects;
CREATE POLICY clearance_files_delete_owner ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'clearance-documents'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

COMMIT;
