"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/actions";
import { navItemsForRole, type NavItem } from "../nav-config";
import type { Database } from "@/types/database";

type Role = Database["public"]["Enums"]["user_role"];

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  VENDEDOR: "Vendedor",
  VISUALIZADOR: "Visualizador",
};

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="grid gap-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-[0_1px_2px_oklch(0.3_0.02_85_/_0.15)]"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  fullName,
  role,
  children,
}: {
  fullName: string;
  role: Role;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = navItemsForRole(role);

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-1">
          <span className="stamp text-primary border-primary shrink-0 text-[0.65rem]">
            CF
          </span>
          <p className="text-sidebar-foreground truncate text-sm font-semibold tracking-tight">
            Comissão de Formatura
          </p>
        </div>
        <div className="flex-1">
          <NavLinks items={navItems} pathname={pathname} />
        </div>
        <div className="receipt-divider pt-3">
          <p className="text-sidebar-foreground truncate text-sm font-medium">
            {fullName}
          </p>
          <Badge variant="outline" stamp className="mt-1.5">
            {roleLabels[role] ?? role}
          </Badge>
          <form action={signOut} className="mt-3">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full"
            >
              <LogOut className="size-4" />
              Sair
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b p-3 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" />}>
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetHeader className="px-0">
                <SheetTitle>Comissão de Formatura</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <NavLinks
                  items={navItems}
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
              <div className="receipt-divider mt-6 pt-3">
                <p className="truncate text-sm font-medium">{fullName}</p>
                <Badge variant="outline" stamp className="mt-1.5">
                  {roleLabels[role] ?? role}
                </Badge>
                <form action={signOut} className="mt-3">
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <LogOut className="size-4" />
                    Sair
                  </Button>
                </form>
              </div>
            </SheetContent>
          </Sheet>
          <span className="stamp text-primary border-primary text-[0.65rem]">CF</span>
          <p className="text-sm font-semibold">Comissão de Formatura</p>
        </header>

        <main className="bg-background flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
