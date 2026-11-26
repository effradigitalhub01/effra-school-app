export interface PiUser {
  username: string;
  uid: string;
}

export async function signInWithPi(): Promise<PiUser> {
  const piGlobal = (
    window as unknown as {
      Pi?: {
        authenticate?: (
          scopes: string[],
          onIncompletePaymentFound: (payment: unknown) => void
        ) => Promise<{ user?: { username?: string; uid?: string } }>;
      };
    }
  ).Pi;

  if (piGlobal && typeof piGlobal.authenticate === 'function') {
    const auth = await piGlobal.authenticate(['username'], () => {});
    return {
      username: auth?.user?.username || 'PiPioneer',
      uid: auth?.user?.uid || 'pi-user',
    };
  }

  return {
    username: 'PiBrowserUser',
    uid: 'local-pi-session',
  };
}
