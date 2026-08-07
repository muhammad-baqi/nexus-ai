import type { Metadata } from "next";

import { SharedItemView } from "@/components/sharing/shared-item-view";

export const metadata: Metadata = {
  title: "Shared item — Nexus",
};

type Props = {
  params: Promise<{ token: string }>;
};

// No auth, no app-shell nav — a public view-only page, outside the (app) route group same as
// login/register/etc.
export default async function SharePage({ params }: Props) {
  const { token } = await params;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <SharedItemView token={token} />
    </div>
  );
}
