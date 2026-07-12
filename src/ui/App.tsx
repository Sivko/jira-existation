import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { JiraPanel } from "./JiraPanel";

export function App() {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <JiraPanel />
    </QueryClientProvider>
  );
}
