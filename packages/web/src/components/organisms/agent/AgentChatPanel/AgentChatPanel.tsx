import { Transaction } from "@etax/shared";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Button, Col, LoadingCircle, Row, Text, Textarea } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { DeductionPatch } from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { AppView, AgentConnectionConfig, ChatMessage, ChatRole, SendKeyMode, ThemeMode } from "@types";
import {
  agentChat,
  ChatSession,
  loadCurrentMessages,
  saveCurrentMessages,
} from "@utils";
import styles from "./AgentChatPanel.css";

/**
 * エージェントが代行する画面操作。ツール実行結果から導き、AppPage が実際の状態変更を行う。
 * - setYear: 年度切替（集計・消費税計算が対象年を引いたとき）
 * - navigate: 画面遷移（集計系はダッシュボード、修正申告の差分は修正申告画面）
 */
export type AgentUiAction =
  | { type: "setYear"; year: number }
  | { type: "navigate"; view: AppView }
  | { type: "setTheme"; mode: ThemeMode }
  | { type: "reloadTransactions" }
  /** 控除入力の変更を画面側の保存値へ適用する（set_deductions の結果）。 */
  | { type: "applyDeductions"; year: number; patch: DeductionPatch }
  /** 設定・申告まわりの変更後に、表示中の画面を読み直す。 */
  | { type: "reloadView" };

export interface AgentChatPanelProps {
  transactions: Transaction[];
  onUiAction?: (action: AgentUiAction) => void;
  /** チャットの送信キー（設定画面で切替、AppPage が保持） */
  sendKeyMode: SendKeyMode;
  /** 送信時点の控除入力スナップショットを返す（エージェントの控除ツール用）。 */
  getDeductionsSnapshot?: () => { year: number; state: unknown } | null;
  /** 外部接続（AI）の上書き設定（設定画面で入力、AppPage が保持） */
  agentConnection: AgentConnectionConfig;
  /** 保存済みの過去の会話（履歴の状態は AppPage が保持し、見出し横のボタンと共有する） */
  sessions: ChatSession[];
  historyOpen: boolean;
  viewing: ChatSession | null;
  onSelectSession: (session: ChatSession) => void;
  /** クリア時に現在の会話を履歴へ保存する。 */
  onArchive: (messages: ChatMessage[]) => void;
  /**
   * クリア操作をヘッダー側（履歴ボタンの隣）へ渡す。
   * クリアできる状態のときだけハンドラを渡し、それ以外は null を渡す。
   */
  onClearReady?: (handler: (() => void) | null) => void;
}

/** 帳簿DBへの書き込み系ツール（成功したら画面の取引を読み直す）。 */
const WRITE_TOOL_NAMES = new Set(["update_transactions", "add_transaction", "delete_transaction"]);

/** 設定系の書き込みツール（成功したら表示中の画面を読み直す）。 */
const SETTINGS_WRITE_TOOL_NAMES = new Set([
  "set_classification_rules",
  "set_jev_prompt",
  "update_systemone_settings",
]);

// ツール実行結果 → 画面操作。同じ操作は1ターンに1回だけ。
const deriveUiActions = (
  toolCalls: { name: string; arguments: Record<string, unknown>; result?: unknown }[],
) => {
  const actions: AgentUiAction[] = [];
  const seen = new Set<string>();
  const push = (action: AgentUiAction) => {
    const key = JSON.stringify(action);
    if (!seen.has(key)) {
      seen.add(key);
      actions.push(action);
    }
  };
  for (const tc of toolCalls) {
    if (tc.name === "aggregate_year" || tc.name === "consumption_tax") {
      if (typeof tc.arguments.year === "number") {
        push({ type: "setYear", year: tc.arguments.year });
      }
      push({ type: "navigate", view: AppView.Dashboard });
    } else if (tc.name === "amendment_delta") {
      // 修正の比較は確定申告画面（前回確定との差分）に出す。
      push({ type: "navigate", view: AppView.Filing });
    } else if (tc.name === "set_theme") {
      const mode = tc.arguments.mode;
      if (mode === "light" || mode === "dark" || mode === "system") {
        push({ type: "setTheme", mode });
      }
    } else if (WRITE_TOOL_NAMES.has(tc.name)) {
      // 書き込みが成功していたら、帳簿の最新状態を画面へ反映する。
      if ((tc.result as { ok?: unknown } | undefined)?.ok === true) {
        push({ type: "reloadTransactions" });
      }
    } else if (tc.name === "set_deductions") {
      // 控除入力の変更は画面側の保存値へ適用し、確定申告画面で見せる。
      const result = tc.result as
        | { ok?: unknown; applied?: unknown; year?: unknown; patch?: unknown }
        | undefined;
      if (result?.ok === true && result.applied === "deductions" && typeof result.year === "number") {
        push({
          type: "applyDeductions",
          year: result.year,
          patch: (result.patch ?? {}) as DeductionPatch,
        });
        push({ type: "navigate", view: AppView.Filing });
      }
    } else if (tc.name === "set_filing_status") {
      // 申告ステータスは確定申告画面の表示に効く。
      if ((tc.result as { ok?: unknown } | undefined)?.ok === true) {
        push({ type: "navigate", view: AppView.Filing });
        push({ type: "reloadView" });
      }
    } else if (tc.name === "update_taxpayer_profile") {
      // 納税者情報は独立画面で見せる。
      if ((tc.result as { ok?: unknown } | undefined)?.ok === true) {
        push({ type: "navigate", view: AppView.Taxpayer });
        push({ type: "reloadView" });
      }
    } else if (SETTINGS_WRITE_TOOL_NAMES.has(tc.name)) {
      // 設定の変更は、設定画面を開いていればその表示に効く。
      if ((tc.result as { ok?: unknown } | undefined)?.ok === true) {
        push({ type: "reloadView" });
      }
    }
  }
  return actions;
};

// 送信キーの修飾キー表示。Mac は ⌘、それ以外（Windows 等）は Ctrl。
const MOD_KEY_LABEL =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "")
    ? "⌘"
    : "Ctrl";

export const AgentChatPanel = ({
  transactions,
  onUiAction,
  sendKeyMode,
  getDeductionsSnapshot,
  agentConnection,
  sessions,
  historyOpen,
  viewing,
  onSelectSession,
  onArchive,
  onClearReady,
}: AgentChatPanelProps) => {
  // 会話は端末に保存し、再読み込みしても続きから使えるようにする。
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadCurrentMessages());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inHistory = historyOpen || viewing !== null;

  // 新しいメッセージが来たら会話ログを一番下までスクロールする（履歴閲覧時は先頭から）。
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = viewing ? 0 : el.scrollHeight;
  }, [messages, loading, viewing, historyOpen]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: ChatRole.User, content: text }];
    setMessages(next);
    saveCurrentMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await agentChat(
        next,
        transactions,
        agentConnection,
        getDeductionsSnapshot?.() ?? undefined,
      );
      // 使ったツールは発言に添えて表示する（何をしたか分かるように）。
      const answered: ChatMessage[] = [
        ...next,
        {
          role: ChatRole.Assistant,
          content: res.reply,
          ...(res.toolCalls.length > 0
            ? {
                toolCalls: res.toolCalls.map((tc) => ({
                  name: tc.name,
                  arguments: tc.arguments,
                })),
              }
            : {}),
        },
      ];
      setMessages(answered);
      saveCurrentMessages(answered);
      if (res.toolCalls.length > 0) {
        const actions = deriveUiActions(res.toolCalls);
        if (onUiAction && actions.length > 0) {
          actions.forEach((action) => onUiAction(action));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 503（キー未設定）などは案内としてそのまま見せる
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // クリア = いまの会話を履歴へ保存してから空にする（履歴から後で見返せる）。
  const clearChat = () => {
    if (messages.length === 0) return;
    onArchive(messages);
    setMessages([]);
    saveCurrentMessages([]);
  };

  // クリアボタンはヘッダー（履歴の隣）に置くため、押せる状態だけハンドラを渡す。
  useEffect(() => {
    onClearReady?.(!inHistory && messages.length > 0 && !loading ? clearChat : null);
    // clearChat は毎レンダーで作り直されるが、状態が変わったときだけ親へ伝えれば足りる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, inHistory, loading, onClearReady]);

  return (
    <div className={styles.root}>

      {viewing ? (
        <div className={styles.chatLog} ref={logRef}>
          <Text variant="muted">
            {formatSessionDate(viewing.savedAt)} の会話（保存済み・{viewing.messages.length}件）
          </Text>
          <MessageBubbles items={viewing.messages} />
        </div>
      ) : historyOpen ? (
        <div className={styles.chatLog} ref={logRef}>
          <Col gap="sm">
            {sessions.length === 0 ? (
              <Text variant="muted">保存済みの会話はまだありません。</Text>
            ) : null}
            {sessions.map((session) => (
              <Button
                key={session.id}
                variant="ghost"
                size="sm"
                className={styles.sessionItem}
                onClick={() => onSelectSession(session)}
              >
                <Col gap="none">
                  <Text variant="caption">
                    {formatSessionDate(session.savedAt)} ・ {session.messages.length}件
                  </Text>
                  <Text>{sessionExcerpt(session)}</Text>
                </Col>
              </Button>
            ))}
          </Col>
        </div>
      ) : (
        <>
          <div className={styles.chatLog} ref={logRef}>
            {messages.length === 0 && !loading ? (
              <Text variant="muted">
                質問や、集計・計算などの処理を頼めます。設定の変更もできます。例:
                「2024年の所得を集計して」「2024年の消費税を3方式で比べて」
                「ファミリーマートの支出はどのくらい？」「ＣａＳｙの科目を雑費に変えて」
                「『よどばし』を消耗品費にする分類ルールを追加して」
              </Text>
            ) : null}
            {messages.length === 0 && !loading ? (
              <Text variant="muted">
                ※ このAIエージェントは税制の一般的な説明と、帳簿の集計・計算・操作の代行を行います。
                個別の取引が経費にできるか等の税務判断は行いません。個別の判断が必要な場合は税理士へご相談ください。
              </Text>
            ) : null}
            <MessageBubbles items={messages} />
            {loading && (
              <div className={clsx(styles.bubble, styles.role[ChatRole.Assistant])}>
                <Row gap="sm" align="center">
                  <LoadingCircle />
                  <span>考え中…</span>
                </Row>
              </div>
            )}
          </div>
          {error && <AlertBox variant="error">{error}</AlertBox>}
          <Row gap="sm" align="end" className={styles.inputRow}>
            <Textarea
              className={styles.inputFlex}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // 日本語入力の変換確定Enterでは絶対に送らない。
                if (e.nativeEvent.isComposing) return;
                const modPressed = e.metaKey || e.ctrlKey;
                const shouldSend =
                  sendKeyMode === "modEnter" ? modPressed : !e.shiftKey && !modPressed;
                if (shouldSend) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={
                sendKeyMode === "modEnter"
                  ? `質問を入力（${MOD_KEY_LABEL}+Enterで送信・Enterで改行）`
                  : "質問を入力（Enterで送信・Shift+Enterで改行）"
              }
              rows={2}
              disabled={loading}
            />
            <Button onClick={() => void send()} disabled={loading} disabledReason="応答中です">
              送信
            </Button>
          </Row>
        </>
      )}
    </div>
  );
};

/** 会話の吹き出し列。進行中の会話と履歴閲覧で共用する（助手は Markdown で描く）。 */
const MessageBubbles = ({ items }: { items: ChatMessage[] }) => {
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
          </div>
        ),
      )}
    </>
  );
};

/** ツール名の日本語ラベル（チャットのツールチップ表示用）。 */
const TOOL_LABELS: Record<string, string> = {
  import_csv_info: "取込データの確認",
  search_transactions: "取引を検索",
  aggregate_year: "所得を集計",
  consumption_tax: "消費税を計算",
  amendment_delta: "修正申告の差分",
  search_tax_knowledge: "税務知識を検索",
  update_transactions: "取引を一括変更",
  add_transaction: "取引を追加",
  delete_transaction: "取引を削除",
  classify_account: "科目を判定",
  get_classification_rules: "分類ルールを確認",
  set_classification_rules: "分類ルールを保存",
  get_jev_prompt: "判定プロンプトを確認",
  set_jev_prompt: "判定プロンプトを保存",
  get_systemone_settings: "判定モデル設定を確認",
  update_systemone_settings: "判定モデル設定を変更",
  get_filing_status: "申告ステータスを確認",
  set_filing_status: "申告ステータスを変更",
  get_taxpayer_profile: "納税者情報を確認",
  update_taxpayer_profile: "納税者情報を変更",
  get_deductions: "控除入力を確認",
  set_deductions: "控除入力を変更",
  set_theme: "テーマを変更",
};

const toolLabel = (name: string): string => TOOL_LABELS[name] ?? name;

/** チップに出す引数の要約（主要なものだけ短く）。 */
const summarizeToolArgs = (args: Record<string, unknown>): string => {
  const parts: string[] = [];
  const text = (v: unknown, max = 18): string => {
    const s = String(v);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  };
  if (typeof args.year === "number") parts.push(`${args.year}年`);
  if (typeof args.keyword === "string" && args.keyword) parts.push(text(args.keyword));
  if (typeof args.description === "string" && args.description) parts.push(text(args.description));
  if (typeof args.query === "string" && args.query) parts.push(text(args.query));
  if (typeof args.mode === "string") parts.push(args.mode);
  if (typeof args.method === "string") parts.push(args.method);
  if (typeof args.set_category === "string") parts.push(`→ ${args.set_category}`);
  if (typeof args.category === "string" && !args.set_category) parts.push(args.category);
  if (Array.isArray(args.rules)) parts.push(`${args.rules.length}件のルール`);
  if (typeof args.prompt === "string") {
    parts.push(args.prompt === "" ? "自動生成に戻す" : `${args.prompt.length}文字`);
  }
  return parts.join("・");
};

function formatSessionDate(iso: string): string {
  return iso.slice(0, 16).replace("T", " ").replaceAll("-", "/");
}

/** 履歴一覧に出す、その会話の最初の質問の抜粋。 */
function sessionExcerpt(session: ChatSession): string {
  const first = session.messages.find((m) => m.role === ChatRole.User) ?? session.messages[0];
  const text = first?.content.replaceAll("\n", " ") ?? "";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}
