import { HttpRequestError } from "@/errors/http_request_error";
import {
  accountsHttpCode,
  ZohoAuthCode,
  ZohoAuthError,
} from "@/errors/zoho_auth_error";
import { HttpClient } from "@/http/http_client";

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

const AUTH_PATH = "/oauth/v2/auth";
const TOKEN_PATH = "/oauth/v2/token";
const DEFAULT_EXPIRY_SECONDS = 3600;

/** Zoho answers a refused grant with HTTP 200 and an `error` key, so the client's non-2xx
 *  check never fires and the body has to be read. */
function toPayload(body: unknown): ZohoTokenPayload {
  if (typeof body !== "object" || body === null) {
    throw new ZohoAuthError(
      ZohoAuthCode.UnreadableResponse,
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
      ZohoAuthCode.AccountsUnreachable,
      `The Zoho accounts server could not be reached: ${cause.message}`,
      cause,
    );
  }
  if (cause.status < 300) {
    return new ZohoAuthError(
      ZohoAuthCode.UnreadableResponse,
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

/** The Zoho accounts server for one DC. */
export class ZohoAccounts {
  private readonly client: HttpClient;

  private constructor(private readonly credentials: ZohoCredentials) {
    this.client = new HttpClient({ baseUrl: credentials.accountsUrl });
  }

  /** Where to send the browser for consent. `access_type=offline` is what makes Zoho
   *  return a refresh token at all - without it there is nothing to persist. */
  consentUrl(scopes: string[], redirectUri: string, state: string): string {
    const url = new URL(AUTH_PATH, this.credentials.accountsUrl);
    url.searchParams.set("scope", scopes.join(","));
    url.searchParams.set("client_id", this.credentials.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  }

  /** Trades the one-time grant code for a refresh token. Runs once per connection. */
  async exchangeCode(code: string, redirectUri: string): Promise<ZohoGrant> {
    const payload = await this.requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    if (
      payload.refresh_token === undefined ||
      payload.access_token === undefined
    ) {
      throw new ZohoAuthError(
        ZohoAuthCode.MissingRefreshToken,
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
  async refresh(refreshToken: string): Promise<ZohoAccessToken> {
    const payload = await this.requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (payload.access_token === undefined) {
      throw new ZohoAuthError(
        ZohoAuthCode.MissingAccessToken,
        "Zoho returned no access token.",
      );
    }
    return {
      accessToken: payload.access_token,
      expiresInSeconds: payload.expires_in ?? DEFAULT_EXPIRY_SECONDS,
    };
  }

  /** A URLSearchParams body reaches the wire untouched as form-urlencoded. Passing an
   *  object instead would serialize it as JSON, which this endpoint rejects. */
  private async requestToken(
    fields: Record<string, string>,
  ): Promise<ZohoTokenPayload> {
    const form = new URLSearchParams({
      ...fields,
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
    });
    try {
      const { body } = await this.client.post(TOKEN_PATH, form);
      return toPayload(await body.json());
    } catch (cause) {
      if (cause instanceof HttpRequestError) {
        throw toAuthError(cause);
      }
      throw cause;
    }
  }

  static create(credentials: ZohoCredentials): ZohoAccounts {
    return new ZohoAccounts(credentials);
  }
}
