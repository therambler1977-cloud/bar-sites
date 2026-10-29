import Link from "next/link";
import { requireAdminBar } from "@/lib/admin";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin", label: "Today" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/specials", label: "Specials" },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/hours", label: "Hours" },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const bar = await requireAdminBar();
  return (
    <div className="admin" style={{ "--accent": bar.accentColor } as React.CSSProperties}>
      <header className="admin-header">
        <div className="admin-top">
          <span className="wordmark">{bar.name}</span>
          <div className="admin-top-links">
            <Link href="/">View site</Link>
            <form action={logout}>
              <button type="submit" className="link-button">Sign out</button>
            </form>
          </div>
        </div>
        <nav className="tabs" aria-label="Admin sections">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href}>{t.label}</Link>
          ))}
        </nav>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
