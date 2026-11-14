import { AgentChatPanel } from "@components/organisms/agent";
import { ViewPageProps } from "@types";

export const AgentPage = ({ transactions }: ViewPageProps) => {
  return <AgentChatPanel transactions={transactions} />;
};
