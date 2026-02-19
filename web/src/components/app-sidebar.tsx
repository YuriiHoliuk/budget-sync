"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  WalletIcon,
  ArrowLeftRightIcon,
  TagsIcon,
  SettingsIcon,
  LogOutIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useMonth } from "@/hooks/use-month";

interface NavigationItem {
  title: string;
  href: string;
  icon: typeof LayoutDashboardIcon;
  dataQa: string;
  isActive: (pathname: string) => boolean;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { email, logout } = useAuth();
  const { month } = useMonth();

  const navigationItems: NavigationItem[] = [
    {
      title: "Budget",
      href: `/budgets/${month}`,
      icon: LayoutDashboardIcon,
      dataQa: "nav-budget",
      isActive: (path) => path.startsWith("/budgets/"),
    },
    {
      title: "Accounts",
      href: "/accounts",
      icon: WalletIcon,
      dataQa: "nav-accounts",
      isActive: (path) => path.startsWith("/accounts"),
    },
    {
      title: "Transactions",
      href: "/transactions",
      icon: ArrowLeftRightIcon,
      dataQa: "nav-transactions",
      isActive: (path) => path.startsWith("/transactions"),
    },
    {
      title: "Categories",
      href: "/categories",
      icon: TagsIcon,
      dataQa: "nav-categories",
      isActive: (path) => path.startsWith("/categories"),
    },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={`/budgets/${month}`}>
                <Image
                  src="/logo.svg"
                  alt="Netto"
                  width={32}
                  height={32}
                  className="size-8 rounded-lg"
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Netto</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Personal Finance
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.isActive(pathname)}
                    tooltip={item.title}
                  >
                    <Link href={item.href} data-qa={item.dataQa}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <Link href="/settings" data-qa="nav-settings">
                <SettingsIcon />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarSeparator />
          {email && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={logout}
                tooltip="Sign out"
                className="text-muted-foreground hover:text-foreground"
                data-qa="btn-logout"
              >
                <LogOutIcon />
                <span className="truncate text-xs">{email}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
