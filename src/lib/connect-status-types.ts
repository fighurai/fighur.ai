export type ConnectStatusResponse = {
  configured: boolean;
  signedIn?: boolean;
  needsSignInForConnect?: boolean;
  hint?: string;
  google: { connected: boolean; email?: string; available?: boolean };
  microsoft: { connected: boolean; email?: string; available?: boolean };
};
