import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";
import { AuthShell } from "@/features/auth/AuthShell";

/**
 * The heading, icon badge and back-link live inside {@link ForgotPasswordForm}
 * because the handoff swaps the entire title block once the link has been sent.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell showcase="sign-in">
      <ForgotPasswordForm {...(error ? { serverError: decodeURIComponent(error) } : {})} />
    </AuthShell>
  );
}
