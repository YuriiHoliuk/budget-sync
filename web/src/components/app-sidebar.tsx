"use client";

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

const navigationItems = [
  {
    title: "Budget",
    href: "/",
    icon: LayoutDashboardIcon,
    dataQa: "nav-budget",
  },
  {
    title: "Accounts",
    href: "/accounts",
    icon: WalletIcon,
    dataQa: "nav-accounts",
  },
  {
    title: "Transactions",
    href: "/transactions",
    icon: ArrowLeftRightIcon,
    dataQa: "nav-transactions",
  },
  {
    title: "Categories",
    href: "/categories",
    icon: TagsIcon,
    dataQa: "nav-categories",
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { email, logout } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-sm font-bold">
                  B
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Budget Sync</span>
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
              {navigationItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <Link href={item.href} data-qa={item.dataQa}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
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
