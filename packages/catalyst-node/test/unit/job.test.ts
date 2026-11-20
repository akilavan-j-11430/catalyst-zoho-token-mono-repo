import { describe, expect, it, vi } from "vitest";
import { Job } from "@/job";
import { ErrorCode } from "@/error-codes";
import { inRequest } from "../in-request";

const { createCron } = vi.hoisted(() => ({ createCron: vi.fn(async (): Promise<object> => ({})) }));

vi.mock("@zcatalyst/job-scheduling", () => ({
  JobScheduling: class {
    CRON = { createCron };
  },
}));

function jobAliased(aliasName: string): Job<{ todoId: string }> {
  return Job.create<{ todoId: string }>({
    jobName: "reminder",
    aliasName,
    jobPoolName: "default",
    jobTargetFunctionName: "job-executor",
  });
}

describe("Job.create", () => {
  it("takes an alias of letters, digits and underscores", () => {
    expect(jobAliased("send_reminder_2").config.aliasName).toBe("send_reminder_2");
  });

  it.each(["send-reminder", "send reminder", "", "a".repeat(21)])(
    "rejects the alias %j, which Catalyst would refuse as a job_name",
    (aliasName) => {
      expect(() => jobAliased(aliasName)).toThrow(
        expect.objectContaining({ code: ErrorCode.INVALID_RESOURCE }),
      );
    },
  );
});

describe("Job.submitOneTimeCron", () => {
  it("sends the time of execution in seconds, which is what Catalyst reads", async () => {
    const reminder = jobAliased("reminder");

    await inRequest(() =>
      reminder.submitOneTimeCron({
        timeOfExecution: 1_800_000_000_999,
        params: { todoId: "1" },
        cronName: "remind_0001",
      }),
    );

    expect(createCron).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ cron_detail: { time_of_execution: "1800000000" } }),
    );
  });

  it.each([1_800_000_000, Number.NaN])(
    "rejects %d before any call, as seconds or not a time at all",
    async (timeOfExecution) => {
      const reminder = jobAliased("reminder");

      const scheduling = inRequest(() =>
        reminder.submitOneTimeCron({ timeOfExecution, params: { todoId: "1" }, cronName: "remind_0001" }),
      );

      await expect(scheduling).rejects.toMatchObject({ code: ErrorCode.INVALID_RESOURCE });
      expect(createCron).not.toHaveBeenCalled();
    },
  );
});
