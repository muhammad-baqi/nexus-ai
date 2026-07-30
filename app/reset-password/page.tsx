import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password — Nexus",
};

const COPY = {
  expired: {
    heading: "This link has expired",
    body: "Password reset links don't last forever. Request a new one.",
  },
  invalid: {
    heading: "This link isn't valid",
    body: "It may have already been used, or the link was copied incorrectly. Request a new one.",
  },
} as const;

type ErrorStatus = keyof typeof COPY;

function isErrorStatus(value: string | undefined): value is ErrorStatus {
  return value === "expired" || value === "invalid";
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  if (isErrorStatus(status)) {
    const { heading, body } = COPY[status];
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex w-full max-w-sm flex-col gap-2" role="status">
          <h1 className="text-xl font-semibold">{heading}</h1>
          <p className="text-muted-foreground text-sm">{body}</p>
          <Link href="/forgot-password" className="text-sm font-medium underline">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
