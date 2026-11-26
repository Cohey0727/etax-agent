import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

interface SidebarContextValue {
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  sidebarOpen: false,
  openSidebar: () => undefined,
  closeSidebar: () => undefined,
});

/** サイドバーの開閉状態を持つプロバイダ。 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const value = useMemo(
    () => ({ sidebarOpen, openSidebar, closeSidebar }),
    [sidebarOpen, openSidebar, closeSidebar],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  return useContext(SidebarContext);
}
