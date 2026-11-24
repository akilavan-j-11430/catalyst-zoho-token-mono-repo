import type { z } from "zod";
import { InvalidInputError } from "@/invalid-input-error";

/**
 * Checks input from outside the app - a body, a query, path params - against a zod schema,
 * and hands back the typed value. A caller declares the shape once as a schema and never
 * writes a check per field.
 */
export class InputValidation {
  /**
   * The parsed value, or an `InvalidInputError` naming the first problem. A schema writes each
   * message as what is wrong with the field - `"is not a valid email address."` - and the
   * field's path is put in front, so the caller reads `emailId is not a valid email address.`
   */
  static parse<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
    const result = schema.safeParse(input);
    if (result.success) {
      return result.data;
    }
    const [issue] = result.error.issues;
    throw new InvalidInputError({
      field: issue?.path.join(".") ?? "",
      problem: issue?.message ?? "is not valid.",
    });
  }
}
