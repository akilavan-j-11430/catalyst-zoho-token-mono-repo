export const WebPath = {
  Home: "/",
  SignIn: "/sign-in",
  SignUp: "/sign-up",
  /** Zoho's redirect uri. The Zoho client's Authorized Redirect URI is this path on the app's
   *  origin, so moving the page means changing it there too. */
  ZohoTokenCallback: "/zoho-token/callback",
} as const;

export type WebPath = (typeof WebPath)[keyof typeof WebPath];
