import type { z } from "zod";
import { HttpError } from "@/http-error";

/**
 * Checks what a request sent - a body, a query, path params - against a zod schema, and
 * hands back the typed value. A route declares the shape once as a schema and never writes
 * a check per field.
 */
export class RequestInput {
  /**
   * The parsed value, or a 400 naming the first problem. A schema writes each message as
   * what is wrong with the field - `"is not a valid email address."` - and the field's path
   * is put in front, so the client reads `emailId is not a valid email address.`
   */
  static parse<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
    const result = schema.safeParse(input);
    if (result.success) {
      return result.data;
    }
    const [issue] = result.error.issues;
    const field = issue?.path.join(".") ?? "";
    const problem = issue?.message ?? "is not valid.";
    throw HttpError.BadRequest(field === "" ? problem : `${field} ${problem}`);
  }
}
