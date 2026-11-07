# OLOPSC security API

This is a server-side Node.js/Express/PostgreSQL starter module for authentication,
role-based authorization, clearance review, and audit logging. It is intentionally
separate from the static browser demo. The current HTML/JavaScript pages still use
LocalStorage and demo credentials; they are not secured by this API until their
client-side data flow is migrated to these endpoints.

## Setup

Requirements: Node.js 20+ and PostgreSQL.

1. Create a database and a restricted database account for the application.
2. From this directory, install dependencies with `npm install`.
3. Apply `schema.sql` using a migration/owner account, not the application's
   database login. Grant the application login only the permissions it needs.
   For a role named `clearance_app`, a starting point is:

   ```sql
   GRANT SELECT ON roles, permissions, role_permissions, departments TO clearance_app;
   GRANT SELECT, INSERT ON users TO clearance_app;
   GRANT SELECT, INSERT, UPDATE ON registration_invites, clearance_requests TO clearance_app;
   GRANT SELECT, INSERT ON audit_logs TO clearance_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON user_sessions TO clearance_app;
   GRANT USAGE, SELECT ON SEQUENCE audit_logs_audit_id_seq TO clearance_app;
   ```

   Keep the schema owner and migration credentials separate from the API login.
4. Copy `.env.example` to `.env`; set `DATABASE_URL` and a unique, random
   `SESSION_SECRET` of at least 32 bytes.
5. Create the first admin. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD` (12–72 UTF-8
   bytes), and `ADMIN_NAME` in the environment, then run `npm run create-admin`.
   The password is hashed with bcrypt; it is not stored in the database.
6. Verify each student's identity against school records, then issue a one-time
   registration token. Set `STUDENT_ID`, `STUDENT_NAME`, `STUDENT_PROGRAM`, and
   `STUDENT_YEAR`, and run `npm run create-student-invite`. Deliver the printed
   token privately; it expires in seven days and is stored only as a hash.
7. Start the API with `npm start`; check `GET /api/health`.

Do not commit `.env` or use the example credentials in a deployed system. Use
HTTPS in production, set `NODE_ENV=production`, and set `TRUST_PROXY=true` only
when the app is behind a correctly configured trusted reverse proxy. The auth
rate limiter uses in-memory storage; use a shared rate-limit store when deploying
multiple server instances.

## Security behavior

- Registration requires an expiring, single-use token issued only after school
  identity verification. It always assigns the `student` role; the request
  cannot set or elevate its role. Create administrators with the provisioning
  script.
- Passwords use bcrypt hashes. Login sessions are server-side PostgreSQL
  sessions in an HttpOnly, SameSite=Strict cookie. Production cookies are Secure.
- Mutating API endpoints require a CSRF token from `GET /api/auth/csrf`, sent in
  the `X-CSRF-Token` header. Login returns a rotated token for subsequent calls.
- Student clearance reads are scoped to the signed-in student's user ID. Admin
  review and audit access require the corresponding RBAC permissions.
- SQL uses parameterized queries. Inputs are validated with strict schemas;
  database constraints provide an additional integrity layer.
- Clearance changes and their audit records are committed in the same database
  transaction. Audit rows have a database trigger preventing updates and deletes.
- `POST /api/student/clearance` accepts text fields only. Upload documents through
  a separately secured file-storage workflow; do not store untrusted uploads as
  data URLs in browser storage or directly serve them as executable content.

## Example review and audit operation

After an admin signs in and obtains a CSRF token, a clearance decision can be sent:

```http
PATCH /api/admin/clearance/REQUEST_UUID
Content-Type: application/json
X-CSRF-Token: TOKEN_FROM_LOGIN_OR_CSRF_ENDPOINT
Cookie: olopsc.sid=SESSION_COOKIE

{"status":"approved","note":""}
```

For rejection, `status` must be `rejected` and `note` must contain feedback. The
API updates only a pending request and inserts the actor, target student,
department, decision, timestamp, IP address, and user agent into `audit_logs`
within the same transaction. If the audit insert fails, the clearance update is
rolled back as well. `GET /api/admin/audit-logs` is restricted to admins.

Student registration accepts only a verified one-time invitation:

```json
{
  "username": "student01",
  "password": "a-long-unique-password",
  "invitationToken": "64-character-hex-token-from-the-school"
}
```

Obtain a CSRF token first from `GET /api/auth/csrf`, and send it in
`X-CSRF-Token` on `POST /api/auth/register`. Student identity/profile fields
come from the invitation record rather than untrusted registration input.
