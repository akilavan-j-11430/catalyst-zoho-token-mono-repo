/** Thrown when code that needs the execution context runs outside one. */
export class AsyncContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsyncContextError";
  }

  override toString(): string {
    let text = `AsyncContextError: ${this.message}`;
    if (this.stack) {
      text += ` \nStack \n${this.stack}`;
    }
    return text;
  }
}
