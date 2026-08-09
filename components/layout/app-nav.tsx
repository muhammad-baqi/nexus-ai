"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FolderOpen,
  LayoutDashboard,
  Search,
  Settings,
  Tag,
  Trash2,
} from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "Search", icon: Search },
  { href: "/collections", label: "Collections", icon: FolderOpen },
  { href: "/tags", label: "Tags", icon: Tag },
  { href: "/trash", label: "Trash", icon: Trash2 },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-2.5">
      <div className="flex items-center gap-1">
        <Link href="/dashboard" className="mr-3 font-semibold">
          Nexus
        </Link>
        {LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </div>
      <LogoutButton />
    </nav>
  );
}
