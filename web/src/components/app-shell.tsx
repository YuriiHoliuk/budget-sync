"use client";

import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { MonthProvider } from "@/hooks/use-month";
import { AuthProvider } from "@/hooks/use-auth";
import { AuthGate } from "@/components/auth-gate";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>
        <MonthProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="max-h-svh overflow-hidden">
              <AppHeader />
              <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
            </SidebarInset>
          </SidebarProvider>
        </MonthProvider>
      </AuthGate>
    </AuthProvider>
  );
}
