import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../src/db.js';

const studentId = process.env.STUDENT_ID?.trim().toUpperCase();
const fullName = process.env.STUDENT_NAME?.trim();
const program = process.env.STUDENT_PROGRAM?.trim();
const academicYear = process.env.STUDENT_YEAR?.trim();

try {
  if (!studentId || !/^[A-Z0-9-]{4,24}$/.test(studentId)) {
    throw new Error('Set STUDENT_ID to a valid student identifier.');
  }
  if (!fullName || fullName.length > 120) throw new Error('Set STUDENT_NAME (maximum 120 characters).');
  if (!program || program.length > 120) throw new Error('Set STUDENT_PROGRAM (maximum 120 characters).');
  if (!academicYear || academicYear.length > 40) throw new Error('Set STUDENT_YEAR (maximum 40 characters).');

  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  await pool.query(
    `INSERT INTO registration_invites
     (token_hash, student_id, full_name, program, academic_year, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')`,
    [tokenHash, studentId, fullName, program, academicYear]
  );
  console.log(`One-time registration token for ${studentId} (expires in 7 days):\n${token}`);
  console.log('Deliver this token privately to the verified student; it cannot be retrieved later.');
} catch (error) {
  if (error.code === '23505') {
    console.error('An invite or account already exists for that student ID.');
  } else {
    console.error(error.message || 'Could not create the student invite.');
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
