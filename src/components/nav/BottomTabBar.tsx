"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  MessageSquare,
  Plus,
  Network,
  CircuitBoard,
  type LucideIcon,
} from "lucide-react";

type TabDef = {
  slug: string;
  href: string;
  code: string;
  label: string;
  Icon: LucideIcon;
};

/**
 * Five tabs — Scholastic Archive taxonomy.
 *   COLLECTION (feed)  · grid of archive items
 *   DIALOGUE (history) · chat sessions
 *   INITIATE (create)  · parallelogram CTA — Caster entry
 *   INDEX (find)       · vertical carousel of characters
 *   PROTOCOL (me)      · operator profile
 */
const TABS: TabDef[] = [
  { slug: "feed", href: "/feed", code: "COLLECTION", label: "COLLECTION", Icon: LayoutGrid },
  { slug: "history", href: "/history", code: "DIALOGUE", label: "DIALOGUE", Icon: MessageSquare },
  { slug: "create", href: "/create", code: "INITIATE", label: "INITIATE", Icon: Plus },
  { slug: "find", href: "/find", code: "INDEX", label: "INDEX", Icon: Network },
  { slug: "me", href: "/me", code: "PROTOCOL", label: "PROTOCOL", Icon: CircuitBoard },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Archive navigation"
      className="shrink-0 border-t border-outline-variant/20 bg-surface/90 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex justify-around items-center px-3 pt-3 pb-3">
        {TABS.map(({ slug, href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={slug}>
              <Link
                href={href as "/feed" | "/find" | "/create" | "/history" | "/me"}
                aria-current={active ? "page" : undefined}
                className={[
                  "group relative flex items-center justify-center transition-all duration-200 active:scale-95",
                  active ? "text-on-tertiary-container" : "text-on-surface-variant/60 hover:text-on-surface-variant",
                ].join(" ")}
              >
                {active ? (
                  <span
                    className="relative inline-flex items-center gap-2 px-4 py-2 bg-tertiary-container"
                    style={{ transform: "skewX(-12deg)" }}
                  >
                    <span
                      className="flex flex-col items-center"
                      style={{ transform: "skewX(12deg)" }}
                    >
                      <Icon size={18} strokeWidth={2} aria-hidden />
                      <span className="label-scholastic-xs mt-1">{label}</span>
                    </span>
                  </span>
                ) : (
                  <span className="flex flex-col items-center px-3 py-2">
                    <Icon size={18} strokeWidth={1.75} aria-hidden />
                    <span className="label-scholastic-xs mt-1">{label}</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
