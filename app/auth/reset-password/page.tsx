import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";

/**
 * Landing page for the recovery link. `/auth/callback` exchanges the emailed
 * code for a recovery session and forwards here. If there is no session (link
 * opened directly, or expired), bounce to forgot-password with a message rather
 * than showing a form that can't work.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      "/auth/forgot-password?error=" +
        encodeURIComponent("Your reset link is invalid or has expired. Request a new one."),
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
