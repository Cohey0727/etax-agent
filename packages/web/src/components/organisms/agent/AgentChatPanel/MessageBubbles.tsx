import { clsx } from "clsx";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Icon } from "@components/atoms";
import { ChatMessage, ChatRole } from "@types";
import { summarizeToolArgs, toolLabel } from "./agentChatHelpers";
import styles from "./AgentChatPanel.css";

/** 会話の吹き出し列。進行中の会話と履歴閲覧で共用する（助手は Markdown で描く）。 */
export const MessageBubbles = ({ items }: { items: ChatMessage[] }) => {
  return (
    <>
      {items.map((m, i) =>
        m.role === ChatRole.Assistant ? (
          <div key={i} className={styles.assistantBlock}>
            <div className={clsx(styles.bubble, styles.role[m.role], styles.assistantBubble)}>
              <div className={styles.markdown}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw, rehypeSanitize]}
                  components={{
                    // 外部画像は読み込まない（読み込み自体がビーコンになり、
                    // 閲覧情報が外部へ漏れるため、Issue #9）。代替テキストだけ出す。
                    img: ({ alt }) => <span>[画像{alt ? `: ${alt}` : ""}]</span>,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
            </div>
            {m.toolCalls && m.toolCalls.length > 0 ? (
              <div className={styles.toolList}>
                {m.toolCalls.map((tc, j) => (
                  <span key={j} className={styles.toolChip} title={tc.name}>
                    🔧 {toolLabel(tc.name)}
                    {summarizeToolArgs(tc.arguments) ? `（${summarizeToolArgs(tc.arguments)}）` : ""}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div key={i} className={clsx(styles.bubble, styles.role[m.role])}>
            {m.content}
            {m.attachments && m.attachments.length > 0 ? (
              <div className={styles.bubbleAttachments}>
                {m.attachments.map((attachment, j) => (
                  <span key={j} className={styles.bubbleAttachmentChip}>
                    <Icon name="fileCheck" size={13} />
                    <span className={styles.attachmentName}>{attachment.name}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ),
      )}
    </>
  );
};
