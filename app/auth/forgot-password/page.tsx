import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {decodeURIComponent(error)}
          </p>
        )}
        <ForgotPasswordForm />
        <p className="text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/auth/sign-in" className="underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
