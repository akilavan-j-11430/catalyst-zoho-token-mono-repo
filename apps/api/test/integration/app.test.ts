import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { ApiPath } from "@repo/routing/api-path";
import { catalystAuth } from "../catalyst-auth";
import type { RegisteredUser } from "@repo/types/user";
import { app } from "@/app";

// `zcAuth.init` is faked for the whole workspace by test/setup.ts. The user registration
// is faked here, so no request reaches Catalyst.
const { registerUser } = vi.hoisted(() => ({ registerUser: vi.fn() }));

vi.mock("@repo/node-utils/catalyst/user-management", () => ({
  UserManagement: { register: registerUser },
}));

const V1 = ApiPath.Api + ApiPath.V1;
const REGISTER_PATH = V1 + ApiPath.Auth + ApiPath.Register;

const newUser = { firstName: "Asha", lastName: "Rao", emailId: "asha@example.com" };

beforeEach(() => {
  vi.stubEnv("AUTH_REDIRECT_URL", "https://app.example.com/welcome");
});

describe("GET /api/v1/ping", () => {
  it("answers pong in the record envelope", async () => {
    const pong = await request(app).get(V1 + ApiPath.Ping);

    expect(pong.status).toBe(200);
    expect(pong.body).toEqual({ status: "success", data: { message: "pong" } });
  });
});

describe("an unknown path", () => {
  it("answers 404 in the error envelope", async () => {
    const notFound = await request(app).get("/api/v1/no-such-route");

    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({
      status: "error",
      message: "The requested url does not exist.",
    });
  });
});

describe("POST /api/v1/auth/register", () => {
  it("registers a valid user with the Admin app and answers 201", async () => {
    const registeredUser: RegisteredUser = { userId: "7", isConfirmed: false, ...newUser };
    registerUser.mockResolvedValue(registeredUser);

    const registration = await request(app).post(REGISTER_PATH).send(newUser);

    expect(registration.status).toBe(201);
    expect(registration.body).toEqual({ status: "success", data: registeredUser });
    expect(registerUser).toHaveBeenCalledWith(newUser, "https://app.example.com/welcome");
    expect(catalystAuth.init).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      scope: CatalystScope.Admin,
    });
  });
});

describe("POST /api/v1/auth/register failures", () => {
  it("answers 400 for an invalid email without registering anyone", async () => {
    const rejection = await request(app)
      .post(REGISTER_PATH)
      .send({ ...newUser, emailId: "not-an-email" });

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({
      status: "error",
      message: "emailId is not a valid email address.",
    });
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("answers 500 when the Catalyst app cannot be built", async () => {
    catalystAuth.init.mockRejectedValue(new Error("app/invalid_project_details"));

    const failure = await request(app).post(REGISTER_PATH).send(newUser);

    expect(failure.status).toBe(500);
    expect(failure.body).toEqual({ status: "error", message: "Something went wrong." });
    expect(registerUser).not.toHaveBeenCalled();
  });
});
