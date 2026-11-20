export const WebPath = {
  Home: "/",
  SignIn: "/sign-in",
  SignUp: "/sign-up",
} as const;

export type WebPath = (typeof WebPath)[keyof typeof WebPath];
