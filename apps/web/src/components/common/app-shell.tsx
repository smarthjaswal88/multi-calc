"use client";

/**
 * The application shell.
 *
 * A fixed left sidebar with two destinations, the user menu and theme control pinned to the
 * bottom, and a single scrolling content column. Not a card-grid dashboard: this app opens on
 * the user's data, and the chrome should stay quiet enough to disappear.
 *
 * The sidebar collapses to an icon rail rather than disappearing. The document editor is a wide
 * table that wants every pixel, so the width has to be reclaimable — but a sidebar that vanishes
 * takes navigation, the theme control and sign-out with it, and leaves nothing to click to bring
 * them back. Collapsed, every destination is still one click away.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  BarChart3,
  FileText,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Sigma,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "@/lib/sidebar-store";
import { useHydrated } from "@/lib/use-hydrated";

const NAV = [
  { href: "/documents", label: "Documents", Icon: FileText },
  { href: "/report", label: "Report", Icon: BarChart3 },
  { href: "/archive", label: "Archive", Icon: Archive },
];

/** Where the collapsed choice is remembered, so it survives a reload and a route change. */

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useMe();

  // The collapse preference lives in localStorage, which is a genuine external system — so it is
  // read through useSyncExternalStore rather than in an effect. The transition is withheld until
  // hydration so a restored rail settles into place instead of visibly sliding shut on load.
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const mounted = useHydrated();

  /**
   * Sign out, clearing local state even if the request fails.
   *
   * `void signOut()` discarded the promise, so a failed logout produced an unhandled rejection and
   * left the user on the page looking signed in. The local session is cleared regardless: the
   * cookie may survive on the server, but leaving cached documents on screen after someone asked to
   * leave is the worse outcome, and the next request will 401 and bounce them to /login anyway.
   */
  async function signOut(): Promise<void> {
    try {
      await api.auth.logout();
    } catch {
      toast.error("Couldn't reach the server, but you've been signed out locally.");
    } finally {
      queryClient.clear();
      router.push("/login");
    }
  }

  return (
    <div className="flex min-h-dvh">
      <nav
        className={cn(
          "no-print sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-sidebar-border bg-sidebar lg:flex",
          collapsed ? "w-14" : "w-56",
          mounted && "transition-[width] duration-200 ease-out",
        )}
        aria-label="Main"
      >
        <div
          className={cn(
            "flex items-center gap-2 py-4",
            collapsed ? "flex-col gap-3 px-0" : "px-4",
          )}
        >
          <Sigma className="size-4 shrink-0 text-primary" />
          {!collapsed && (
            <span className="truncate text-sm font-semibold tracking-tight">
              Pricing Calculator
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={
              collapsed ? "Expand the sidebar" : "Collapse the sidebar"
            }
            title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
            className={cn(
              "rounded-md p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground",
              !collapsed && "ml-auto",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        <Separator className="bg-sidebar-border" />

        <ul className="flex-1 space-y-0.5 p-2">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  // The label is the only hover hint left once it is out of sight.
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md py-1.5 text-sm transition-colors",
                    collapsed ? "justify-center px-0" : "px-2.5",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {/* Kept in the accessibility tree when hidden: an icon-only link with no
                      accessible name is unusable to a screen reader. */}
                  <span className={cn("truncate", collapsed && "sr-only")}>
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="space-y-2 p-2">
          {/* Three segments across need the full width; stacked, they fit the rail — with more
              air between them, since vertically adjacent squares read as one block where a row
              of them reads as segments. Inset grows with the gap to keep the well even. */}
          <ThemeToggle
            className={collapsed ? "flex-col gap-2 p-1.5" : undefined}
          />

          {user &&
            (collapsed ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Sign out of ${user.email}`}
                title={`Sign out of ${user.email}`}
                className="h-7 w-full justify-center px-0"
                onClick={() => void signOut()}
              >
                <LogOut className="size-3.5" />
              </Button>
            ) : (
              <div className="space-y-1.5 rounded-md border border-sidebar-border bg-card p-2">
                <p
                  className="truncate text-[0.75rem] text-muted-foreground"
                  title={user.email}
                >
                  {user.email}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start gap-2 px-1.5"
                  onClick={() => void signOut()}
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </Button>
              </div>
            ))}
        </div>
      </nav>

      {/* Mobile: the sidebar collapses to a top bar. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between border-b border-border px-4 py-2.5 lg:hidden">
          <div className="flex items-center gap-2">
            <Sigma className="size-4 text-primary" />
            <span className="text-sm font-semibold">Pricing</span>
          </div>
          <div className="flex items-center gap-2">
            {NAV.map(({ href, label }) => (
              <Button key={href} asChild variant="ghost" size="sm">
                <Link href={href}>{label}</Link>
              </Button>
            ))}
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
