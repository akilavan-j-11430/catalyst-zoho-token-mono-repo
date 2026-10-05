import { HttpRequestError } from "@/errors/http-request-error";
import {
  accountsHttpCode,
  ZohoAuthErrorCode,
  ZohoAuthError,
} from "@/errors/zoho-auth-error";
import { HttpClient } from "@/http/http-client";
import type { ResponseBody } from "@/types/http";
import { PLimit } from "@/utils/p-limit";

/** What identifies this application to Zoho. Supplied by the app that owns the keys. */
export interface ZohoCredentials {
  /** The whole accounts server url including the scheme - `https://accounts.zoho.in`. */
  accountsUrl: string;
  clientId: string;
  clientSecret: string;
}

/** A fresh grant: the refresh token to keep, and the access token that came with it. */
export interface ZohoGrant {
  refreshToken: string;
  accessToken: string;
  expiresInSeconds: number;
}

export interface ZohoAccessToken {
  accessToken: string;
  expiresInSeconds: number;
}

/** What Zoho puts on the wire, named as Zoho names it and converted below. */
interface ZohoTokenPayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

const DEFAULT_EXPIRY_SECONDS = 3600;
/** Zoho throttles the accounts server; one instance never holds more open than this. */
const MAX_CONCURRENT_REQUESTS = 10;

const accountsRequests = new PLimit(MAX_CONCURRENT_REQUESTS);

/** Zoho answers a refused grant with HTTP 200 and an `error` key, so the client's non-2xx
 *  check never fires and the body has to be read. */
function toPayload(body: unknown): ZohoTokenPayload {
  if (typeof body !== "object" || body === null) {
    throw new ZohoAuthError(
      ZohoAuthErrorCode.UnreadableResponse,
      "Zoho did not return a JSON object.",
    );
  }
  const payload = body as ZohoTokenPayload;
  if (payload.error !== undefined) {
    throw new ZohoAuthError(
      payload.error,
      `Zoho refused the token request: ${payload.error}`,
    );
  }
  return payload;
}

/** Nothing but `ZohoAuthError` leaves this file, so a caller handles one error type rather
 *  than Zoho's refusals and the transport's failures separately. */
function toAuthError(cause: HttpRequestError): ZohoAuthError {
  if (cause.status === undefined) {
    return new ZohoAuthError(
      ZohoAuthErrorCode.AccountsUnreachable,
      `The Zoho accounts server could not be reached: ${cause.message}`,
      cause,
    );
  }
  if (cause.status < 300) {
    return new ZohoAuthError(
      ZohoAuthErrorCode.UnreadableResponse,
      `Zoho answered ${cause.status} with a body that is not JSON.`,
      cause,
    );
  }
  return new ZohoAuthError(
    accountsHttpCode(cause.status),
    `Zoho answered ${cause.status}: ${cause.body ?? "(no body)"}`,
    cause,
  );
}

/** The Zoho accounts server. Stateless: whoever calls it supplies the credentials, so
 *  this file holds no configuration and stores nothing. */
export class ZohoAccounts {
  /** Where to send the browser for consent. `access_type=offline` is what makes Zoho
   *  return a refresh token at all - without it there is nothing to persist. */
  static consentUrl(
    credentials: ZohoCredentials,
    scopes: string[],
    redirectUri: string,
    state: string,
  ): string {
    const url = new URL("/oauth/v2/auth", credentials.accountsUrl);
    url.searchParams.set("scope", scopes.join(","));
    url.searchParams.set("client_id", credentials.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  }

  /** Trades the one-time grant code for a refresh token. Runs once per connection. */
  static async exchangeCode(
    credentials: ZohoCredentials,
    code: string,
    redirectUri: string,
  ): Promise<ZohoGrant> {
    const payload = await ZohoAccounts.requestToken(credentials, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    if (
      payload.refresh_token === undefined ||
      payload.access_token === undefined
    ) {
      throw new ZohoAuthError(
        ZohoAuthErrorCode.MissingRefreshToken,
        "Zoho returned no refresh token. Check that the consent url carried access_type=offline.",
      );
    }
    return {
      refreshToken: payload.refresh_token,
      accessToken: payload.access_token,
      expiresInSeconds: payload.expires_in ?? DEFAULT_EXPIRY_SECONDS,
    };
  }

  /** Mints an access token from a stored refresh token. */
  static async refresh(
    credentials: ZohoCredentials,
    refreshToken: string,
  ): Promise<ZohoAccessToken> {
    const payload = await ZohoAccounts.requestToken(credentials, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (payload.access_token === undefined) {
      throw new ZohoAuthError(
        ZohoAuthErrorCode.MissingAccessToken,
        "Zoho returned no access token.",
      );
    }
    return {
      accessToken: payload.access_token,
      expiresInSeconds: payload.expires_in ?? DEFAULT_EXPIRY_SECONDS,
    };
  }

  /** Ends a grant at Zoho, so the refresh token stops minting anywhere. The token goes in
   *  the body rather than the query Zoho documents, because the client logs every url. */
  static async revoke(
    credentials: ZohoCredentials,
    refreshToken: string,
  ): Promise<void> {
    await ZohoAccounts.send(
      credentials,
      "/oauth/v2/token/revoke",
      new URLSearchParams({ token: refreshToken }),
      async () => undefined,
    );
  }

  private static async requestToken(
    credentials: ZohoCredentials,
    fields: Record<string, string>,
  ): Promise<ZohoTokenPayload> {
    const form = new URLSearchParams({
      ...fields,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    });
    return ZohoAccounts.send(
      credentials,
      "/oauth/v2/token",
      form,
      async (body) => toPayload(await body.json()),
    );
  }

  /** A URLSearchParams body reaches the wire untouched as form-urlencoded. Passing an
   *  object instead would serialize it as JSON, which these endpoints reject. `read` runs
   *  inside the same catch, so a body that fails to decode is mapped like any failure. */
  private static async send<T>(
    credentials: ZohoCredentials,
    path: string,
    form: URLSearchParams,
    read: (body: ResponseBody) => Promise<T>,
  ): Promise<T> {
    const client = new HttpClient({ baseUrl: credentials.accountsUrl });
    try {
      const { body } = await accountsRequests.run(() => client.post(path, form));
      return await read(body);
    } catch (cause) {
      if (cause instanceof HttpRequestError) {
        throw toAuthError(cause);
      }
      throw cause;
    }
  }
}
