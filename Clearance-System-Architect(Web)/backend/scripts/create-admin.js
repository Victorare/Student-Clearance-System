import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from '../src/db.js';

const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_NAME?.trim();

try {
  if (!username || !/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new Error('Set ADMIN_USERNAME to a 3–32 character username.');
  }
  if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Set ADMIN_PASSWORD to a password between 12 and 72 UTF-8 bytes.');
  }
  if (!fullName || fullName.length > 120) throw new Error('Set ADMIN_NAME to the administrator name.');

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, role_id, full_name)
     SELECT $1, $2, role_id, $3 FROM roles WHERE name = 'admin'
     RETURNING user_id, username`,
    [username, passwordHash, fullName]
  );
  if (!result.rowCount) throw new Error('Admin role is missing. Apply schema.sql first.');
  console.log(`Created admin account "${result.rows[0].username}" (${result.rows[0].user_id}).`);
} catch (error) {
  if (error.code === '23505') {
    console.error('That username is already registered; no account was changed.');
  } else {
    console.error(error.message || 'Could not create the administrator account.');
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
