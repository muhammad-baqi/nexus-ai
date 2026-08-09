import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { signAvatarUrl } from "@/lib/supabase/avatar";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { DeleteAccountForm } from "@/components/auth/delete-account-form";
import { DataExportForm } from "@/components/settings/data-export-form";
import { DataImportForm } from "@/components/settings/data-import-form";
import { LanguageSelector } from "@/components/settings/language-selector";
import { NotificationToggle } from "@/components/settings/notification-toggle";
import { ProfileForm } from "@/components/settings/profile-form";
import { ThemeToggle } from "@/components/settings/theme-toggle";

// Each section component already renders its own `<h2 className="text-lg font-semibold">` —
// this just gives that existing heading + content a real card boundary instead of a flat <hr>.
function SettingsSection({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export const metadata: Metadata = {
  title: "Settings — Nexus",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // app/(app)/layout.tsx already redirects to /login when signed out, so `user` is always
  // present here — narrowed for TypeScript.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, theme_preference, language_preference, notification_email_enabled")
    .eq("id", user!.id)
    .single();

  if (error) {
    console.error("[settings] fetching profile failed:", error);
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <SettingsSection>
        <ProfileForm
          initialDisplayName={profile?.display_name ?? null}
          initialAvatarUrl={await signAvatarUrl(supabase, profile?.avatar_url ?? null)}
          email={user!.email!}
        />
      </SettingsSection>

      <SettingsSection>
        <ThemeToggle initialPreference={profile?.theme_preference ?? "system"} />
      </SettingsSection>

      <SettingsSection>
        <LanguageSelector initialPreference={profile?.language_preference ?? "en"} />
      </SettingsSection>

      <SettingsSection>
        <NotificationToggle initialEnabled={profile?.notification_email_enabled ?? true} />
      </SettingsSection>

      <SettingsSection>
        <DataExportForm />
      </SettingsSection>

      <SettingsSection>
        <DataImportForm />
      </SettingsSection>

      <SettingsSection>
        <ChangePasswordForm />
      </SettingsSection>

      <SettingsSection>
        <DeleteAccountForm />
      </SettingsSection>
    </div>
  );
}
