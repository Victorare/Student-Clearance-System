# OLOPSC Supabase setup

The static website now calls Supabase Auth, Postgres, and private Storage instead
of using browser LocalStorage for accounts or clearance records. The files under
`backend/` are a separate earlier Express starter and are not used by these pages.

## 1. Create and configure the Supabase project

1. Open the intended Supabase project and confirm its environment before
   applying database changes.
2. Run `schema.sql` in the SQL Editor as the project database owner. The script
   also upgrades the existing prototype tables: it keeps the existing profile
   and clearance rows, adds the columns used by this app, maps legacy department
   and note values, and creates the missing invitation, department, and audit
   structures. It does not drop the existing tables.
3. In **Authentication → URL Configuration**, set the local development URL and
   the production website URL. Add each login page URL to the allowed redirect
   URLs.
4. In **Authentication → Providers → Email**, configure email verification and
   require passwords of at least 12 characters.
5. The project URL and publishable browser key are configured in
   `js/supabase-client.js`. If the project is recreated, replace them with that
   project's URL and publishable (legacy anon) key from **Project Settings → API**.

The publishable/anon key is intended to be used in a browser; Row Level Security
is the security boundary. **Never put a service-role or secret API key in
JavaScript, HTML, or source control.**

## 2. Create a student registration invitation

Run `node supabase/create-registration-invite.mjs` in a trusted terminal. It
prints an SQL insert containing the SHA-256 token hash and a one-time plaintext
token. Run the insert in the Supabase SQL Editor and send the token privately to
the verified student. It expires after seven days and can only be used once.
The database trigger assigns the `Student` role and copies the verified school
record from that invitation; role and student profile fields are never accepted
from the registration form.

## 3. Provision an administrator

Do not expose an Admin registration form. Create an admin Auth user from a
trusted server or Supabase Edge Function using the Auth Admin API and the
service-role secret stored only in that server's environment:

```js
const { data, error } = await supabase.auth.admin.createUser({
  email: 'admin@school.example',
  password: process.env.ADMIN_INITIAL_PASSWORD,
  email_confirm: true,
  app_metadata: { role: 'Admin' },
  user_metadata: { full_name: 'OLOPSC Administrator' }
});
if (error) throw error;
```

The database's Auth trigger creates the Admin profile only when the trusted
`app_metadata.role` is `Admin`. Use a unique initial password and rotate it
after setup. Never run this code in the browser or ship the service-role key.

## 4. Run the site

Open the project folder in VS Code and run the website with Live Server (or
another local HTTP server). Browser ES modules will not work when opening the
HTML files directly with `file://`. Sign in uses the email address and password;
the account-creation link is for students with an invitation token.

The login, student dashboard, clearance page, profile, and admin dashboard load
their own JavaScript modules. The admin chart fetches server-calculated live
status counts and displays status proportions in an accessible SVG chart.

## Security model

- Supabase Auth handles password storage and sessions.
- The `profiles` table stores `Student` / `Admin` role mappings. Clients can
  read their own profile; clients cannot change roles.
- RLS scopes students to their own clearance rows and limits clearance, audit,
  and document access to authorized users.
- `submit_clearance_request` checks the current student's identity in Postgres.
- `review_clearance_request` permits only an Admin, updates only pending
  requests, and inserts the audit record in the same transaction. The admin ID,
  target student ID, action, department, and server-generated ISO timestamp are
  recorded. Client code cannot write audit records directly.
- The `audit_logs` table blocks updates, deletes, and truncation with a trigger.
- Documents use a private Storage bucket. RLS restricts object paths, and the
  bucket enforces the 1 MB size and allowed MIME type limits. Admin document
  links are short-lived signed URLs.
- UI guards and input checks improve UX; Postgres RLS, constraints, and RPC
  permission checks are the actual access controls.

The client data module provides `submitClearanceRequest(...)`,
`getPendingClearanceRequests()`, `reviewClearanceRequest(...)`, and
`getAdminStatusCounts()` for the student submit, admin pending-list, admin
decision, and chart flows respectively.

An administrator can inspect the immutable audit trail through SQL Editor:

```sql
SELECT admin_id, target_student_id, department_id, action, occurred_at
FROM public.audit_logs
ORDER BY occurred_at DESC;
```

The client checks allowed filename extensions and MIME type as convenience
validation. These client checks are not a proof of file content. For a public
production service, add server-side file signature scanning and malware review.

## Existing demo data

The old LocalStorage demo credentials and browser-stored clearance data are no
longer used by the pages. Do not copy passwords from the old demo into Supabase.
Existing prototype profiles remain in place; fill in missing official student
details after verifying them with school records.
