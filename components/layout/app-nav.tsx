import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/search", label: "Search" },
  { href: "/collections", label: "Collections" },
  { href: "/tags", label: "Tags" },
  { href: "/trash", label: "Trash" },
  { href: "/settings", label: "Settings" },
];

export function AppNav() {
  return (
    <nav className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="font-semibold">
          Nexus
        </Link>
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm font-medium">
            {link.label}
          </Link>
        ))}
      </div>
      <LogoutButton />
    </nav>
  );
}
