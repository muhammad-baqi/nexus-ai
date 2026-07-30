import type { Metadata } from "next";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { DeleteAccountForm } from "@/components/auth/delete-account-form";

export const metadata: Metadata = {
  title: "Settings — Nexus",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-10 px-4 py-16">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <ChangePasswordForm />

      <hr className="border-border" />

      <DeleteAccountForm />
    </div>
  );
}
