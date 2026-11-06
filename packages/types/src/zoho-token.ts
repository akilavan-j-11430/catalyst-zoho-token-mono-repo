/** Whether the signed-in user's Zoho grant is stored. Answered by status and disconnect. */
export type ZohoConnectionStatus = {
  connected: boolean;
};

/** Where to send the browser for Zoho's consent screen. Answered by connect. */
export interface ZohoConsent {
  consentUrl: string;
}

/** What Zoho hands the callback page after consent, which it posts on to the api. */
export interface ZohoGrantCode {
  code: string;
  state: string;
}
