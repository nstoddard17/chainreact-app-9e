"use client";

import { useEffect, useState } from "react";
import { fetchIsInternalAdmin } from "@/lib/api/internalAdmin";

/**
 * Client hook: is the signed-in caller a ChainReact internal admin?
 *
 * Drives visibility of the internal "React Agent Feedback" nav link. Defaults to
 * `false` and only flips true once the caller-only status check confirms it, so
 * the link is hidden by default and on ANY error (fail closed). A module-level
 * single-flight promise dedupes the request so the desktop rail nav and the
 * mobile drawer nav (both mount per authenticated page) share ONE fetch.
 *
 * This is convenience only: the `/admin/react-agent` page and metrics API keep
 * their own server-side gates.
 */
let cached: Promise<boolean> | null = null;

export function useIsInternalAdmin(): boolean {
  const [isInternalAdmin, setIsInternalAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    if (!cached) cached = fetchIsInternalAdmin();
    cached
      .then((value) => {
        if (active) setIsInternalAdmin(value === true);
      })
      .catch(() => {
        if (active) setIsInternalAdmin(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return isInternalAdmin;
}

/** Test-only: clear the cross-component single-flight cache between cases. */
export function __resetInternalAdminStatusCache(): void {
  cached = null;
}
