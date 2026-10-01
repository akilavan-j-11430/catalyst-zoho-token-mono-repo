/**
 * Represents a runtime error within the application.
 */
export class RuntimeError extends Error {
  constructor(
    message: string,
  ) {
    super(message);
    this.name = "RuntimeError";
  }

  toString(): string {
    let text = `RuntimeError: ${this.message}`;
    if (this.stack) {
      text += ` \nStack \n${this.stack}`;
    }
    return text;
  }
}
