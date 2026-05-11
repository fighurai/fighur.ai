export type ConnectStatusResponse = {
  configured: boolean;
  signedIn?: boolean;
  needsSignInForConnect?: boolean;
  hint?: string;
  google: { connected: boolean; email?: string };
  microsoft: { connected: boolean; email?: string };
  slack: { connected: boolean; email?: string; team?: string };
};
