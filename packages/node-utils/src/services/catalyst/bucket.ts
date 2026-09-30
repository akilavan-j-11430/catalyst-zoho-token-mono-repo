import { CatalystError } from "@/errors/catalyst_error";
import { Stratus } from "@zcatalyst/stratus";
import { currentContext } from "@/framework/async_context";
import { Readable } from "node:stream";

type CatalystBucket = ReturnType<Stratus["bucket"]>;

/** How `getObject` hands the object back. `stream` is the default because it is the only
 *  one that does not buffer the whole object in memory. */
type ObjectFormat = "stream" | "text" | "json";

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. */
function stratus(): Stratus {
  return new Stratus(currentContext().manager.catalyst);
}

/** `listPagedObjects` returns either a plain detail record or an object handle. */
function keyOf(entry: { key?: string; keyDetails?: { key: string } }): string {
  return entry.keyDetails ? entry.keyDetails.key : (entry.key ?? "");
}

async function readStream(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export class Bucket {
  private constructor(private readonly name: string) {}

  private bucket(): CatalystBucket {
    return stratus().bucket(this.name);
  }

  buildKey(...parts: string[]): string {
    return parts.join("/");
  }

  async listObject(options: {
    maxKeys?: number;
    prefix?: string;
    nextToken?: string;
  }): Promise<{ items: string[]; nextToken?: string }> {
    const objects = await this.bucket().listPagedObjects({
      prefix: options.prefix,
      maxKeys: options.maxKeys?.toString(),
      continuationToken: options.nextToken,
    });
    return {
      items: objects.contents.map(keyOf),
      nextToken: objects.next_continuation_token,
    };
  }

  /** Uploads an object. A TTL below the Catalyst minimum is rejected before the call. */
  async putObject(
    key: string,
    data: string | Readable,
    options?: { overwrite?: boolean; ttl?: number },
  ): Promise<void> {
    if (options?.ttl !== undefined && options.ttl < 60) {
      throw CatalystError.InvalidResource("TTL must be at least 60 seconds.");
    }
    const uploadOptions: { overwrite?: string; ttl?: string } = {};
    if (options?.overwrite) {
      uploadOptions.overwrite = "true";
    }
    if (options?.ttl !== undefined) {
      uploadOptions.ttl = options.ttl.toString();
    }
    await this.bucket().putObject(key, data, uploadOptions);
  }

  async generatePreSignedUrl(
    key: string,
    expiryInSeconds: number,
  ): Promise<string> {
    const result = await this.bucket().generatePreSignedUrl(key, "GET", {
      expiryIn: expiryInSeconds.toString(),
    });
    if (!result.signature) {
      throw CatalystError.InvalidResource(
        `Failed to generate pre-signed URL for key ${key}`,
      );
    }
    return result.signature;
  }

  private async openObject(key: string): Promise<Readable> {
    try {
      return await this.bucket().getObject(key);
    } catch (cause) {
      throw CatalystError.ResourceNotFound(
        `Object with key ${key} not found in bucket ${this.name}`,
        cause,
      );
    }
  }

  async getObject(key: string, options?: { as?: "stream" }): Promise<Readable>;
  async getObject(key: string, options: { as: "text" }): Promise<string>;
  async getObject<T = Record<string, unknown>>(
    key: string,
    options: { as: "json" },
  ): Promise<T>;
  async getObject(
    key: string,
    options?: { as?: ObjectFormat },
  ): Promise<unknown> {
    const stream = await this.openObject(key);
    const as = options?.as ?? "stream";
    if (as === "stream") {
      return stream;
    }
    const text = await readStream(stream);
    if (as === "text") {
      return text;
    }
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw CatalystError.InvalidResource(
        `Object with key ${key} in bucket ${this.name} is not JSON`,
        cause,
      );
    }
  }


  async deleteObject(key: string): Promise<void> {
    await this.bucket().deleteObject(key);
  }

  async deletePath(path: string): Promise<void> {
    await this.bucket().deletePath(path);
  }

  static create(name: string): Bucket {
    return new Bucket(name);
  }
}
