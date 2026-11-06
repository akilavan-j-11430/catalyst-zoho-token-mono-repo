import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HttpError } from "@/http-error";
import { RequestInput } from "@/request-input";

const signUp = z.object(
  {
    emailId: z.string({ error: "is required." }).trim().pipe(z.email("is not a valid email address.")),
    address: z.object({ city: z.string({ error: "is required." }) }),
  },
  { error: "Expected a JSON object." },
);

function rejectionOf(input: unknown): HttpError {
  try {
    RequestInput.parse(signUp, input);
  } catch (error) {
    if (error instanceof HttpError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the input to be rejected.");
}

describe("RequestInput.parse", () => {
  it("returns the parsed value, with the schema's transforms applied", () => {
    const parsed = RequestInput.parse(signUp, {
      emailId: "  asha@example.com ",
      address: { city: "Chennai" },
    });

    expect(parsed).toEqual({ emailId: "asha@example.com", address: { city: "Chennai" } });
  });

  it("answers 400 naming the field and what is wrong with it", () => {
    const rejection = rejectionOf({ emailId: "not-an-email", address: { city: "Chennai" } });

    expect(rejection.status).toBe(400);
    expect(rejection.message).toBe("emailId is not a valid email address.");
  });

  it("names a nested field by its full path", () => {
    expect(rejectionOf({ emailId: "asha@example.com", address: {} }).message).toBe(
      "address.city is required.",
    );
  });

  it("uses the schema's own message when the whole input is the problem", () => {
    expect(rejectionOf("a string").message).toBe("Expected a JSON object.");
  });
});
