import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface FabProps {
  href: string;
  icon: React.ElementType;
  label: string;
  className?: string;
}

// Floating action button. Anchored bottom-right of the viewport on
// mobile only (`md:hidden`). The bottom offset clears the AppLayout
// bottom tab bar (min-h-[3.5rem] + safe-area-inset) so the button is
// thumb-reachable without colliding with the nav. Pair it with the
// same destination's header button on desktop (hide that button at
// mobile widths) — duplicating the action would be confusing.
export function Fab({ href, icon: Icon, label, className }: FabProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "fixed right-4 z-30 flex h-14 w-14 items-center justify-center",
        "rounded-full bg-(--color-primary) text-(--color-primary-foreground)",
        "shadow-lg transition-transform active:scale-95",
        // 3.5rem tab bar + safe-area + 1.25rem gap so the FAB clears
        // the bottom nav without crowding it.
        "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]",
        "md:hidden print:hidden",
        className,
      )}
    >
      <Icon className="h-6 w-6" aria-hidden="true" />
    </Link>
  );
}
