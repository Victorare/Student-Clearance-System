import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcrypt';
import connectPgSimple from 'connect-pg-simple';
import express from 'express';
import session from 'express-session';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { inTransaction, pool } from './db.js';

const app = express();
const PgSessionStore = connectPgSimple(session);
const isProduction = process.env.NODE_ENV === 'production';
const sessionCookieName = isProduction ? '__Host-olopsc.sid' : 'olopsc.sid';
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || Buffer.byteLength(sessionSecret, 'utf8') < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 bytes.');
}
const dummyPasswordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '16kb', strict: true }));
app.use(session({
  name: sessionCookieName,
  secret: sessionSecret,
  store: new PgSessionStore({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: false
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' }
});

const usernameSchema = z.string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'Username must be 3-32 letters, numbers, dots, underscores, or hyphens.');
const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters.')
  .max(72, 'Password must be at most 72 UTF-8 bytes.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.');
const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  invitationToken: z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
}).strict();
const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(72)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.')
}).strict();
const submitSchema = z.object({
  departmentId: z.string().trim().regex(/^[a-z-]{2,40}$/),
  note: z.string().trim().max(1000).default('')
}).strict();
const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(1000).default('')
}).strict().refine((value) => value.status !== 'rejected' || value.note.length > 0, {
  message: 'A note is required when rejecting a request.',
  path: ['note']
});
const uuidSchema = z.string().uuid();

function validate(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(' ');
    throw new HttpError(400, message);
  }
  return result.data;
}

function createCsrfToken() {
  return randomBytes(32).toString('hex');
}

function requireCsrf(req, _res, next) {
  const expected = req.session.csrfToken;
  const supplied = req.get('x-csrf-token');
  if (!expected || !supplied || !/^[a-f0-9]{64}$/.test(supplied)) {
    return next(new HttpError(403, 'The security token is missing or invalid. Refresh and try again.'));
  }
  const expectedBytes = Buffer.from(expected, 'hex');
  const suppliedBytes = Buffer.from(supplied, 'hex');
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return next(new HttpError(403, 'The security token is missing or invalid. Refresh and try again.'));
  }
  return next();
}

async function requireAuth(req, _res, next) {
  if (!req.session.userId) return next(new HttpError(401, 'Sign in is required.'));
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.username, u.full_name, u.student_id, r.name AS role
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1`,
      [req.session.userId]
    );
    if (!result.rowCount) {
      await sessionOperation(req, 'destroy');
      return next(new HttpError(401, 'Your session is no longer valid. Sign in again.'));
    }
    req.user = result.rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(roleName) {
  return (req, _res, next) => {
    if (req.user?.role !== roleName) return next(new HttpError(403, 'You do not have permission to perform this action.'));
    return next();
  };
}

function requirePermission(permissionName) {
  return async (req, _res, next) => {
    try {
      const result = await pool.query(
        `SELECT EXISTS (
           SELECT 1
           FROM role_permissions rp
           JOIN permissions p ON p.permission_id = rp.permission_id
           JOIN users u ON u.role_id = rp.role_id
           WHERE u.user_id = $1 AND p.name = $2
         ) AS allowed`,
        [req.user.user_id, permissionName]
      );
      if (!result.rows[0].allowed) {
        return next(new HttpError(403, 'You do not have permission to perform this action.'));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function sessionOperation(req, method) {
  return promisify(req.session[method].bind(req.session))();
}

function clientDetails(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 512) || null
  };
}

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});

app.get('/api/auth/csrf', (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = createCsrfToken();
  res.set('Cache-Control', 'no-store');
  res.json({ csrfToken: req.session.csrfToken });
});

app.post('/api/auth/register', authLimiter, requireCsrf, async (req, res) => {
  const input = validate(registerSchema, req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const user = await inTransaction(async (client) => {
      const tokenHash = createHash('sha256').update(input.invitationToken, 'utf8').digest('hex');
      const invitation = await client.query(
        `SELECT student_id, full_name, program, academic_year
         FROM registration_invites
         WHERE token_hash = $1 AND claimed_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [tokenHash]
      );
      if (!invitation.rowCount) {
        throw new HttpError(400, 'The registration invitation is invalid, expired, or already used.');
      }
      const student = invitation.rows[0];
      const result = await client.query(
        `INSERT INTO users (username, password_hash, role_id, student_id, full_name, program, academic_year)
         SELECT $1, $2, role_id, $3, $4, $5, $6
         FROM roles WHERE name = 'student'
         RETURNING user_id, username, student_id, full_name`,
        [input.username, passwordHash, student.student_id, student.full_name, student.program, student.academic_year]
      );
      if (!result.rowCount) throw new Error('Student role is missing from the database.');
      await client.query(
        `UPDATE registration_invites SET claimed_at = now()
         WHERE token_hash = $1 AND claimed_at IS NULL`,
        [tokenHash]
      );
      return result.rows[0];
    });
    res.status(201).json({ user, message: 'Student account created. You can now sign in.' });
  } catch (error) {
    if (error.code === '23505') throw new HttpError(409, 'That username or student ID is already registered.');
    throw error;
  }
});

app.post('/api/auth/login', authLimiter, requireCsrf, async (req, res) => {
  const input = validate(loginSchema, req.body);
  const result = await pool.query(
    `SELECT u.user_id, u.username, u.password_hash, u.full_name, u.student_id, r.name AS role
     FROM users u JOIN roles r ON r.role_id = u.role_id
     WHERE u.username = $1`,
    [input.username]
  );
  const user = result.rows[0];
  const matches = await bcrypt.compare(input.password, user?.password_hash ?? dummyPasswordHash);
  if (!user || !matches) throw new HttpError(401, 'Invalid username or password.');

  await sessionOperation(req, 'regenerate');
  req.session.userId = user.user_id;
  req.session.csrfToken = createCsrfToken();
  await sessionOperation(req, 'save');
  res.set('Cache-Control', 'no-store');
  res.json({
    user: {
      userId: user.user_id,
      username: user.username,
      fullName: user.full_name,
      studentId: user.student_id,
      role: user.role
    },
    csrfToken: req.session.csrfToken
  });
});

app.post('/api/auth/logout', requireCsrf, async (req, res) => {
  if (req.session.userId) await sessionOperation(req, 'destroy');
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/'
  });
  res.status(204).end();
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    user: {
      userId: req.user.user_id,
      username: req.user.username,
      fullName: req.user.full_name,
      studentId: req.user.student_id,
      role: req.user.role
    }
  });
});

app.get('/api/student/clearance', requireAuth, requirePermission('clearance:read:own'), async (req, res) => {
  const result = await pool.query(
    `SELECT cr.request_id, cr.department_id, d.name AS department_name, cr.status,
            cr.submitted_at, cr.note, cr.admin_note, cr.reviewed_at
     FROM clearance_requests cr
     JOIN departments d ON d.department_id = cr.department_id
     WHERE cr.student_id = $1
     ORDER BY d.name`,
    [req.user.user_id]
  );
  res.json({ requests: result.rows });
});

app.post('/api/student/clearance', requireAuth, requirePermission('clearance:submit:own'), requireCsrf, async (req, res) => {
  const input = validate(submitSchema, req.body);
  const details = clientDetails(req);
  const result = await inTransaction(async (client) => {
    const department = await client.query(
      'SELECT 1 FROM departments WHERE department_id = $1',
      [input.departmentId]
    );
    if (!department.rowCount) throw new HttpError(404, 'The selected department was not found.');
    const request = await client.query(
      `INSERT INTO clearance_requests (student_id, department_id, status, note)
       VALUES ($1, $2, 'pending', $3)
       ON CONFLICT (student_id, department_id) DO UPDATE
         SET status = 'pending', submitted_at = now(), note = EXCLUDED.note,
             reviewed_by = NULL, reviewed_at = NULL, admin_note = ''
       WHERE clearance_requests.status = 'rejected'
       RETURNING request_id, department_id, status, submitted_at, note`,
      [req.user.user_id, input.departmentId, input.note]
    );
    if (!request.rowCount) {
      throw new HttpError(409, 'A request for this department is already pending or approved.');
    }
    await client.query(
      `INSERT INTO audit_logs
       (actor_user_id, target_student_id, department_id, action, action_status, details, ip_address, user_agent)
       VALUES ($1, $1, $2, 'clearance_submitted', 'pending', $3, $4, $5)`,
      [req.user.user_id, input.departmentId, input.note, details.ipAddress, details.userAgent]
    );
    return request.rows[0];
  });
  res.status(201).json({ request: result });
});

app.get('/api/admin/clearance', requireAuth, requirePermission('clearance:read:any'), async (req, res) => {
  const result = await pool.query(
    `SELECT cr.request_id, cr.status, cr.submitted_at, cr.note, cr.admin_note,
            u.user_id AS student_user_id, u.student_id, u.full_name AS student_name,
            d.department_id, d.name AS department_name
     FROM clearance_requests cr
     JOIN users u ON u.user_id = cr.student_id
     JOIN departments d ON d.department_id = cr.department_id
     ORDER BY cr.submitted_at DESC
     LIMIT 500`
  );
  res.json({ requests: result.rows });
});

app.patch('/api/admin/clearance/:requestId', requireAuth, requireRole('admin'),
  requirePermission('clearance:review:any'), requireCsrf, async (req, res) => {
    const requestId = validate(uuidSchema, req.params.requestId);
    const input = validate(reviewSchema, req.body);
    const details = clientDetails(req);
    const reviewed = await inTransaction(async (client) => {
      const result = await client.query(
        `UPDATE clearance_requests
         SET status = $1, reviewed_by = $2, reviewed_at = now(), admin_note = $3, updated_at = now()
         WHERE request_id = $4 AND status = 'pending'
         RETURNING request_id, student_id, department_id, status, reviewed_at, admin_note`,
        [input.status, req.user.user_id, input.note, requestId]
      );
      if (!result.rowCount) throw new HttpError(409, 'This request is not pending or no longer exists.');
      const request = result.rows[0];
      await client.query(
        `INSERT INTO audit_logs
         (actor_user_id, target_student_id, department_id, action, action_status, details, ip_address, user_agent)
         VALUES ($1, $2, $3, 'clearance_reviewed', $4, $5, $6, $7)`,
        [
          req.user.user_id,
          request.student_id,
          request.department_id,
          request.status,
          request.admin_note,
          details.ipAddress,
          details.userAgent
        ]
      );
      return request;
    });
    res.json({ request: reviewed });
  });

app.get('/api/admin/audit-logs', requireAuth, requireRole('admin'), requirePermission('audit:read'), async (req, res) => {
  const result = await pool.query(
    `SELECT al.audit_id, al.action, al.action_status, al.details, al.ip_address,
            al.user_agent, al.occurred_at,
            actor.username AS actor_username, target.student_id, target.full_name AS target_student,
            d.name AS department_name
     FROM audit_logs al
     JOIN users actor ON actor.user_id = al.actor_user_id
     JOIN users target ON target.user_id = al.target_student_id
     JOIN departments d ON d.department_id = al.department_id
     ORDER BY al.occurred_at DESC
     LIMIT 500`
  );
  res.json({ auditLogs: result.rows });
});

app.use((_req, _res, next) => next(new HttpError(404, 'The requested API route was not found.')));

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'The request body must be valid JSON.' });
  }
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  console.error('Unhandled API error:', error);
  return res.status(500).json({ error: 'The request could not be completed. Please try again.' });
});

export { app };
