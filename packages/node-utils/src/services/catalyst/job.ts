import { CatalystError } from "@/errors/catalyst_error";
import { JobScheduling } from "@zcatalyst/job-scheduling";
import { currentContext } from "@/framework/async_context";
import { randomUUID } from "node:crypto";

/** Catalyst rejects an alias longer than this. */
const MAX_ALIAS_LENGTH = 20;

/** Catalyst rejects a cron name longer than this. */
const MAX_CRON_NAME_LENGTH = 20;

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
 *  so a service must never be hoisted to module scope. */
function jobScheduling(): JobScheduling {
  return new JobScheduling(currentContext().manager.catalyst);
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
  /** Epoch milliseconds. */
  timeOfExecution: number;
  /** Unique in the project, at most `MAX_CRON_NAME_LENGTH` characters. */
  cronName: string;
};

interface JobConfig {
  jobName: string;
  aliasName: string;
  jobPoolName: string;
  /** The function the job pool invokes. It dispatches on the `jobName` in the params. */
  jobTargetFunctionName: string;
}

export class Job<T extends JobParams | void = void> {
  private constructor(readonly config: JobConfig) {}

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
    await jobScheduling().JOB.submitJob(job as unknown as SdkJobMeta);
  }

  /** Queues the job to run once. `cronName` names the cron, must be unique in the
   *  project, and never reaches the job's params. */
  async submitOneTimeCron(input: SubmitOneTimeCronInput<T>): Promise<void> {
    const { timeOfExecution, params, cronName } = input;
    if (cronName.length > MAX_CRON_NAME_LENGTH) {
      throw CatalystError.InvalidResource(
        `Cron name must be at most ${MAX_CRON_NAME_LENGTH} characters, got "${cronName}".`,
      );
    }

    const cron: OneTimeCronRequest = {
      cron_type: "OneTime",
      cron_name: cronName,
      cron_status: true,
      cron_detail: { time_of_execution: timeOfExecution.toString() },
      job_meta: {
        job_name: this.config.aliasName,
        jobpool_name: this.config.jobPoolName,
        target_type: "Function",
        target_name: this.config.jobTargetFunctionName,
        params: { ...params, jobName: this.config.jobName },
      },
    };
    await jobScheduling().CRON.createCron(cron as unknown as SdkCronDetails);
  }

  static create<T extends JobParams | void = void>(config: JobConfig): Job<T> {
    if (config.aliasName.length > MAX_ALIAS_LENGTH) {
      throw CatalystError.InvalidResource(
        `Job alias name must be at most ${MAX_ALIAS_LENGTH} characters, got "${config.aliasName}".`,
      );
    }
    return new Job<T>(config);
  }
}
