/** Content types a call site may declare. See `HttpMethod` for why this is not a TS enum. */
export const ContentType = {
  Json: "application/json",
  FormUrlEncoded: "application/x-www-form-urlencoded",
  Multipart: "multipart/form-data",
  Text: "text/plain",
  Xml: "application/xml",
  OctetStream: "application/octet-stream",
  Pdf: "application/pdf",
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];
