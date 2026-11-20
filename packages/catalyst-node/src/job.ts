import { CatalystError } from "@/catalyst-error";
import { JobScheduling } from "@zcatalyst/job-scheduling";
import { CatalystScope } from "@/catalyst-scope";
import { CatalystSession } from "@/catalyst-session";
import { randomUUID } from "node:crypto";

/** The alias is sent as `job_name`, which Catalyst takes as 1-20 letters, digits or
 *  underscores - a hyphen fails every submit at runtime. */
const ALIAS_NAME_PATTERN = /^[A-Za-z0-9_]{1,20}$/;

/** 2001-09-09 in epoch milliseconds. A smaller time is seconds passed by mistake, which
 *  Catalyst would take as 1970 and run at once. */
const MIN_EPOCH_MS = 1_000_000_000_000;

// Neither SDK method can be satisfied as declared. `submitJob` wants a `TCatalystJobs`
// member, whose `target_type` is a TS enum the package exports from neither its root nor
// its types. `createCron` wants its own *response* shape, demanding `id`, `end_time` and
// `cron_execution_type` that only the server produces. So the wire shapes this repo sends
// are named below and each is cast once, at the call - the payloads stay checked, and
// nothing reaches into the SDK's build output.
type SdkJobMeta = Parameters<JobScheduling["JOB"]["submitJob"]>[0];
type SdkCronDetails = Parameters<JobScheduling["CRON"]["createCron"]>[0];

/** A job targeting a Catalyst function, as Catalyst accepts it. */
interface FunctionJobRequest {
  job_name: string;
  jobpool_name: string;
  target_type: "Function";
  target_name: string;
  params: JobParams;
}

/** A cron that fires once, as Catalyst accepts it. */
interface OneTimeCronRequest {
  cron_name: string;
  cron_type: "OneTime";
  cron_status: boolean;
  cron_detail: { time_of_execution: string };
  job_meta: FunctionJobRequest;
}

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. Job Scheduling is admin-only: the SDK
 *  sends every job and cron call as admin, whatever app it is given. */
function jobScheduling(): JobScheduling {
  return new JobScheduling(CatalystSession.app(CatalystScope.Admin));
}

/** Catalyst carries job params as strings. A job that takes none is `Job<void>`. */
export type JobParams = Record<string, string>;

/** Absent for a `Job<void>`, required for every other job. */
type WithParams<T> = T extends void ? { params?: undefined } : { params: T };

type SubmitJobInput<T> = WithParams<T> & {
  /** Defaults to a UUID. */
  jobId?: string;
};

/** A `Job<void>` needs neither params nor a jobId, so it is called with no argument. */
type SubmitJobArgs<T> = T extends void
  ? [input?: SubmitJobInput<T>]
  : [input: SubmitJobInput<T>];

type SubmitOneTimeCronInput<T> = WithParams<T> & {
  /** Epoch milliseconds, as `Date.getTime()` gives - sent to Catalyst in seconds. */
  timeOfExecution: number;
  /** Kept to letters, digits and underscores as a precaution - only `job_name`'s rule is
   *  confirmed. Catalyst does not enforce uniqueness. */
  cronName: string;
};

interface JobConfig {
  jobName: string;
  aliasName: string;
  jobPoolName: string;
  /** The function the job pool invokes. It dispatches on the `jobName` in the params. */
  jobTargetFunctionName: string;
}

/** A Catalyst job. Holds its config only, and submits for the request in flight with its Admin
 *  credentials - so a job function, which has only the Admin app, can submit one too. */
export class Job<T extends JobParams | void = void> {
  private constructor(readonly config: JobConfig) {}

  static create<T extends JobParams | void = void>(config: JobConfig): Job<T> {
    if (!ALIAS_NAME_PATTERN.test(config.aliasName)) {
      throw CatalystError.InvalidResource(
        `Job alias name must be 1-20 letters, digits or underscores, got "${config.aliasName}".`,
      );
    }
    return new Job<T>(config);
  }

  /** Queues the job for immediate execution. */
  async submitJob(...[input]: SubmitJobArgs<T>): Promise<void> {
    const { params, jobId = randomUUID() } = input ?? {};
    const job: FunctionJobRequest = {
      job_name: this.config.aliasName,
      jobpool_name: this.config.jobPoolName,
      target_type: "Function",
      target_name: this.config.jobTargetFunctionName,
      params: { ...params, jobId, jobName: this.config.jobName },
    };
    const scheduling = jobScheduling();
    try {
      await scheduling.JOB.submitJob(job as unknown as SdkJobMeta);
    } catch (cause) {
      throw CatalystError.InvalidResource(`submitJob failed for ${this.config.jobName}`, cause);
    }
  }

  /** Queues the job to run once. `cronName` names the cron and never reaches the job's
   *  params. */
  async submitOneTimeCron(input: SubmitOneTimeCronInput<T>): Promise<void> {
    const { timeOfExecution, params, cronName } = input;
    if (!Number.isFinite(timeOfExecution) || timeOfExecution < MIN_EPOCH_MS) {
      throw CatalystError.InvalidResource(
        `timeOfExecution must be epoch milliseconds, got ${timeOfExecution}.`,
      );
    }

    const cron: OneTimeCronRequest = {
      cron_type: "OneTime",
      cron_name: cronName,
      cron_status: true,
      // Catalyst reads seconds: milliseconds schedule the run for the year ~58,000, silently.
      cron_detail: { time_of_execution: Math.floor(timeOfExecution / 1000).toString() },
      job_meta: {
        job_name: this.config.aliasName,
        jobpool_name: this.config.jobPoolName,
        target_type: "Function",
        target_name: this.config.jobTargetFunctionName,
        params: { ...params, jobName: this.config.jobName },
      },
    };
    const scheduling = jobScheduling();
    try {
      await scheduling.CRON.createCron(cron as unknown as SdkCronDetails);
    } catch (cause) {
      throw CatalystError.InvalidResource(`submitOneTimeCron failed for ${cronName}`, cause);
    }
  }
}
