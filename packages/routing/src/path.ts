import type { ApiPath } from "@/api-path";

/** Builds a full path from segments. Every segment starts with "/", so joining them
 *  needs no separator. */
export function join(...segments: ApiPath[]): string {
  return segments.join("");
}
