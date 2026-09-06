import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  FileText,
  History,
  LayoutDashboard,
  Settings,
  Ticket,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import type { Database } from "@/types/database";

type Role = Database["public"]["Enums"]["user_role"];

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
};

// Routes are added here as each admin section ships — no dead links to
// pages that don't exist yet.
export const navItems: NavItem[] = [
  {
    href: "/admin/dashboard",
    label: "Painel",
    icon: LayoutDashboard,
    roles: ["ADMIN", "VENDEDOR", "VISUALIZADOR"],
  },
  {
    href: "/admin/rifas",
    label: "Rifas",
    icon: Ticket,
    roles: ["ADMIN", "VENDEDOR", "VISUALIZADOR"],
  },
  {
    href: "/admin/compradores",
    label: "Compradores",
    icon: Users,
    roles: ["ADMIN", "VENDEDOR", "VISUALIZADOR"],
  },
  {
    href: "/admin/financeiro",
    label: "Financeiro",
    icon: Wallet,
    roles: ["ADMIN", "VISUALIZADOR"],
  },
  {
    href: "/admin/documentos",
    label: "Documentos",
    icon: FileText,
    roles: ["ADMIN", "VISUALIZADOR"],
  },
  {
    href: "/admin/relatorios/vendas",
    label: "Relatórios",
    icon: BarChart3,
    roles: ["ADMIN", "VISUALIZADOR"],
  },
  {
    href: "/admin/auditoria",
    label: "Auditoria",
    icon: History,
    roles: ["ADMIN"],
  },
  {
    href: "/admin/usuarios",
    label: "Usuários",
    icon: UserCog,
    roles: ["ADMIN"],
  },
  {
    href: "/admin/configuracoes",
    label: "Configurações",
    icon: Settings,
    roles: ["ADMIN"],
  },
];

export function navItemsForRole(role: Role): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}
