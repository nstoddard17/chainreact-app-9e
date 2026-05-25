import { dropboxRpc } from "./_request";

/**
 * Dropbox `/2/users/get_current_account` — Slice 3.DROPBOX-2.
 *
 * Resolves the connected account at OAuth-callback time. The
 * `account_id` (`dbid:...`) is the load-bearing `providerAccountId` — the
 * future `dropbox:new_file` webhook routes notifications by account id.
 */

export interface DropboxCurrentAccount {
  account_id: string;
  name?: { display_name?: string } | null;
  email?: string | null;
}

export async function currentAccountGet(input: {
  accessToken: string;
}): Promise<DropboxCurrentAccount> {
  // No-arg RPC endpoint — Dropbox wants a literal `null` body.
  return dropboxRpc<DropboxCurrentAccount, null>({
    accessToken: input.accessToken,
    endpoint: "/2/users/get_current_account",
    args: null,
  });
}
