import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const prompt = createInterface({ input, output });
const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;

try {
  const studentId = (await prompt.question('Verified student ID: ')).trim().toUpperCase();
  const fullName = (await prompt.question('Student full name: ')).trim();
  const program = (await prompt.question('Program: ')).trim();
  const academicYear = (await prompt.question('Academic year: ')).trim();
  if (!/^[A-Z0-9-]{4,24}$/.test(studentId)) throw new Error('Student ID must be 4-24 letters, numbers, or hyphens.');
  if (!fullName || fullName.length > 120 || !program || program.length > 120 || !academicYear || academicYear.length > 40) {
    throw new Error('Check the supplied name, program, and academic year.');
  }

  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token, 'utf8').digest('hex');
  console.log('\nRun this statement in the Supabase SQL Editor using a trusted administrator account:\n');
  console.log(
    `INSERT INTO public.registration_invites (token_hash, student_id, full_name, program, academic_year, expires_at)\n` +
    `VALUES ('${hash}', ${sqlLiteral(studentId)}, ${sqlLiteral(fullName)}, ${sqlLiteral(program)}, ${sqlLiteral(academicYear)}, now() + interval '7 days');`
  );
  console.log('\nOne-time student token (send privately; do not save in source control):\n' + token);
} catch (error) {
  console.error(error.message || 'Could not create the registration invitation.');
  process.exitCode = 1;
} finally {
  prompt.close();
}
