/** Whose credentials a Catalyst app acts with. User covers only the methods the browser SDK
 *  exposes; everything else needs Admin. */
export const CatalystScope = {
  User: "user",
  Admin: "admin",
} as const;

export type CatalystScope = (typeof CatalystScope)[keyof typeof CatalystScope];
