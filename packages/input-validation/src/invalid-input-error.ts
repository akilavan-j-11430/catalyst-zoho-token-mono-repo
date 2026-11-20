/** Input that does not match its schema. Knows nothing about HTTP: an HTTP layer answers it
 *  with a 400, and a form shows `problem` beside `field`. */
export class InvalidInputError extends Error {
  /** The path of the offending field, `address.city`; empty when the whole input is wrong. */
  readonly field: string;
  /** What is wrong with it, `is required.` */
  readonly problem: string;

  constructor(issue: { field: string; problem: string }) {
    super(issue.field === "" ? issue.problem : `${issue.field} ${issue.problem}`);
    this.name = "InvalidInputError";
    this.field = issue.field;
    this.problem = issue.problem;
  }
}
