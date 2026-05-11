export type GoogleCookiePayload = {
  v: 1;
  refresh_token: string;
  email?: string;
};

export type MicrosoftCookiePayload = {
  v: 1;
  refresh_token: string;
  email?: string;
};

export type SlackCookiePayload = {
  v: 1;
  access_token: string;
  email?: string;
  team_name?: string;
};
