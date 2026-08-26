"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GraduationCap, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Generar guía" },
  { href: "/examenes", label: "Exámenes" },
  { href: "/horarios", label: "Horarios" },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin/mallas", label: "Mallas" },
  { href: "/admin/usuarios", label: "Docentes" },
];

const THEME_TOGGLE_CLASS =
  "flex items-center gap-1.5 rounded-md bg-yellow-400/90 px-2 py-1 text-green-900 transition-colors hover:bg-yellow-400";

interface NavbarProps {
  userEmail?: string | null;
  isAdmin: boolean;
  onSignOut: () => Promise<void>;
}

export function Navbar({ userEmail, isAdmin, onSignOut }: NavbarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = isAdmin ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS;

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-50 border-b-4 border-yellow-400 bg-green-700">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-lg font-bold text-white"
          onClick={() => setOpen(false)}
        >
          <GraduationCap className="size-6 text-yellow-400" aria-hidden="true" />
          <span>IECV</span>
        </Link>

        {/* Menú horizontal — visible en tablets y desktop (>= 768px) */}
        <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                isActive(item.href)
                  ? "bg-yellow-400 text-green-900"
                  : "text-white hover:bg-yellow-400 hover:text-green-900"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <ThemeToggle className={THEME_TOGGLE_CLASS} />
          {userEmail && (
            <>
              <span className="max-w-40 truncate text-xs text-green-100" title={userEmail}>
                {userEmail}
              </span>
              <form action={onSignOut}>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-yellow-400 text-green-900 hover:bg-yellow-500"
                >
                  Cerrar sesión
                </Button>
              </form>
            </>
          )}
        </div>

        {/* Menú hamburguesa — celulares (< 768px) */}
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Abrir menú"
                className="text-white hover:bg-green-600 hover:text-white"
              >
                <Menu className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-4/5 flex-col border-yellow-400 bg-green-700 text-white sm:max-w-xs"
            >
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-white">
                  <GraduationCap className="size-5 text-yellow-400" aria-hidden="true" />
                  IECV
                </SheetTitle>
              </SheetHeader>

              <div className="flex flex-col gap-1 px-4">
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-2.5 text-base font-semibold transition-colors",
                      isActive(item.href)
                        ? "bg-yellow-400 text-green-900"
                        : "text-white hover:bg-yellow-400 hover:text-green-900"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              <div className="mt-auto flex flex-col gap-3 border-t border-yellow-400/40 px-4 py-4">
                <ThemeToggle className={THEME_TOGGLE_CLASS} />
                {userEmail && (
                  <>
                    <span className="truncate text-xs text-green-100" title={userEmail}>
                      {userEmail}
                    </span>
                    <form action={onSignOut}>
                      <Button
                        type="submit"
                        className="w-full bg-yellow-400 text-green-900 hover:bg-yellow-500"
                      >
                        <LogOut className="size-4" />
                        Cerrar sesión
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
