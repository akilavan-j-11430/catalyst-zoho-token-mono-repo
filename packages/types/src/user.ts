/** Someone to register as a Catalyst app user. */
export type NewUser = {
  firstName: string;
  lastName: string;
  emailId: string;
};

/** The Catalyst app user a request is signed in as. */
export interface CurrentUser {
  userId: string;
  emailId: string;
  firstName: string;
  lastName: string;
}

/** A registered Catalyst app user, awaiting confirmation until they open the email. */
export type RegisteredUser = {
  userId: string;
  emailId: string;
  firstName: string;
  lastName: string;
  isConfirmed: boolean;
};
