import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InputValidation } from "@/input-validation";
import { InvalidInputError } from "@/invalid-input-error";

const signUp = z.object(
  {
    emailId: z.string({ error: "is required." }).trim().pipe(z.email("is not a valid email address.")),
    address: z.object({ city: z.string({ error: "is required." }) }),
  },
  { error: "Expected a JSON object." },
);

function rejectionOf(input: unknown): InvalidInputError {
  try {
    InputValidation.parse(signUp, input);
  } catch (error) {
    if (error instanceof InvalidInputError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the input to be rejected.");
}

describe("InputValidation.parse", () => {
  it("returns the parsed value, with the schema's transforms applied", () => {
    const parsed = InputValidation.parse(signUp, {
      emailId: "  asha@example.com ",
      address: { city: "Chennai" },
    });

    expect(parsed).toEqual({ emailId: "asha@example.com", address: { city: "Chennai" } });
  });

  it("names the field and what is wrong with it", () => {
    const rejection = rejectionOf({ emailId: "not-an-email", address: { city: "Chennai" } });

    expect(rejection).toMatchObject({
      field: "emailId",
      problem: "is not a valid email address.",
      message: "emailId is not a valid email address.",
    });
  });

  it("names a nested field by its full path", () => {
    expect(rejectionOf({ emailId: "asha@example.com", address: {} })).toMatchObject({
      field: "address.city",
      message: "address.city is required.",
    });
  });

  it("uses the schema's own message when the whole input is the problem", () => {
    expect(rejectionOf("a string")).toMatchObject({
      field: "",
      message: "Expected a JSON object.",
    });
  });
});
