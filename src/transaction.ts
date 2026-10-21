// Part B1 - one operation, two statements, one transaction

import { pool } from './db.js';

export interface EnrolInput {
  studentId: string;
  courseId: string;
  secId: string;
  semester: string;
  year: number;
}

/**
 * Enrols a student in a course section and adds the course credits to the
 * student's total.
 *
 * Two statements:
 *   INSERT INTO takes (id, course_id, sec_id, semester, year, grade)
 *     VALUES ($1, $2, $3, $4, $5, NULL)
 *   UPDATE student SET tot_cred = tot_cred + <the course credits>
 *     WHERE id = $1
 *
 * They must both happen or neither. A student enrolled without the credits
 * being added is a database that quietly disagrees with itself.
 *
 * A transaction runs on one connection, so take a client from the pool
 * rather than using the pool directly: BEGIN, both statements, COMMIT, and
 * ROLLBACK if anything fails. Release the client in a finally block.
 *
 * Returns the student's new credit total.
 */
export async function enrolInTypeScript(input: EnrolInput): Promise<number> {
  /* a transaction must run on one connection, so take a client from the pool */
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    /* grade is NULL: the student is enrolled but not graded yet */
    await client.query(`INSERT INTO takes
    (id, course_id, sec_id, semester, year, grade)
    VALUES ($1, $2, $3, $4, $5, NULL)`,
      [input.studentId, input.courseId, input.secId, input.semester, input.year]);
    /* the credits are not in the input, so look them up in course */
    const { rows } = await client.query(`SELECT credits FROM course WHERE course_id = $1`, [input.courseId]);
    const credits = rows[0].credits;
    /* RETURNING gives the new total back from the UPDATE */
    const { rows: updated } = await client.query(`UPDATE student SET tot_cred = tot_cred + $1 WHERE id = $2 RETURNING tot_cred`, [credits, input.studentId]);
    /* both statements succeeded, so make them permanent */
    await client.query('COMMIT');
    /* tot_cred is numeric, which pg returns as a string */
    return Number(updated[0].tot_cred);
  } catch (err) {
    /* if anything failed, undo both statements and pass the error on */
    await client.query('ROLLBACK'); throw err;
  } finally {
    /* always give the client back to the pool, also after an error */
    client.release();
  }
}
