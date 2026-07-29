import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Verify email — Nexus",
};

const COPY = {
  success: {
    heading: "Your email is verified",
    body: "You're signed in and ready to go.",
    action: { href: "/", label: "Back to home" },
  },
  expired: {
    heading: "This link has expired",
    body: "Verification links don't last forever. Register again to get a fresh one.",
    action: { href: "/register", label: "Register again" },
  },
  invalid: {
    heading: "This link isn't valid",
    body: "It may have already been used, or the link was copied incorrectly. Register again to get a fresh one.",
    action: { href: "/register", label: "Register again" },
  },
} as const;

type Status = keyof typeof COPY;

function isStatus(value: string | undefined): value is Status {
  return value === "success" || value === "expired" || value === "invalid";
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: rawStatus } = await searchParams;
  const status: Status = isStatus(rawStatus) ? rawStatus : "invalid";
  const { heading, body, action } = COPY[status];

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-2" role="status">
        <h1 className="text-xl font-semibold">{heading}</h1>
        <p className="text-muted-foreground text-sm">{body}</p>
        <Link href={action.href} className="text-sm font-medium underline">
          {action.label}
        </Link>
      </div>
    </div>
  );
}
