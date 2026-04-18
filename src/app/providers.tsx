"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AdminDockProvider } from "@/contexts/AdminDockContext";
import { AppShell } from "@/components/layout/AppShell";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <SessionProvider>
      <QueryClientProvider client={qc}>
        <AdminDockProvider>
          <AppShell>{children}</AppShell>
        </AdminDockProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
