import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

interface ChatSheetContextValue {
  chatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
}

const ChatSheetContext = createContext<ChatSheetContextValue>({
  chatOpen: false,
  openChat: () => undefined,
  closeChat: () => undefined,
});

/** チャットボトムシートの開閉状態を持つプロバイダ。 */
export function ChatSheetProvider({ children }: { children: ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const openChat = useCallback(() => setChatOpen(true), []);
  const closeChat = useCallback(() => setChatOpen(false), []);
  const value = useMemo(
    () => ({ chatOpen, openChat, closeChat }),
    [chatOpen, openChat, closeChat],
  );
  return <ChatSheetContext.Provider value={value}>{children}</ChatSheetContext.Provider>;
}

export function useChatSheet(): ChatSheetContextValue {
  return useContext(ChatSheetContext);
}
