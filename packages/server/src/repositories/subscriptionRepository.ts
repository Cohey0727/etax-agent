/**
 * subscriptionRepository.ts — 課金状態（Stripe サブスクリプション）の
 * 読み書き（repositories）。所有者ごとに1件。
 */
import { eq } from "drizzle-orm";
import { Db } from "../lib/db";
import { ownerIdForWrite } from "../lib/tenantContext";
import { SubscriptionRow, stripeWebhookEventsTable, subscriptionsTable } from "./schema";

/** プランが有効な status（この状態のときだけ有料機能を使える）。 */
export const ACTIVE_PLAN_STATUSES: ReadonlySet<string> = new Set(["active", "trialing"]);

/** 現在の所有者の課金状態を取得する。無ければ undefined。 */
export async function getSubscriptionRow(
  db: Db,
  ownerUserId: number = ownerIdForWrite(),
): Promise<SubscriptionRow | undefined> {
  const [row] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.ownerUserId, ownerUserId));
  return row;
}

/** Stripe の顧客IDから所有者を引く（Webhook の解決用）。 */
export async function getSubscriptionByCustomerId(
  db: Db,
  customerId: string,
): Promise<SubscriptionRow | undefined> {
  const [row] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.stripeCustomerId, customerId));
  return row;
}

/** 課金状態を保存（作成または更新）する。 */
export async function upsertSubscriptionRow(
  db: Db,
  ownerUserId: number,
  values: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    status: string;
    currentPeriodEnd?: Date | null;
    lastEventCreatedAt?: Date;
  },
): Promise<SubscriptionRow> {
  const insert = {
    ownerUserId,
    stripeCustomerId: values.stripeCustomerId ?? "",
    stripeSubscriptionId: values.stripeSubscriptionId ?? "",
    status: values.status,
    currentPeriodEnd: values.currentPeriodEnd ?? null,
    lastEventCreatedAt: values.lastEventCreatedAt ?? null,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(subscriptionsTable)
    .values(insert)
    .onConflictDoUpdate({
      target: subscriptionsTable.ownerUserId,
      set: {
        ...(values.stripeCustomerId !== undefined
          ? { stripeCustomerId: values.stripeCustomerId }
          : {}),
        ...(values.stripeSubscriptionId !== undefined
          ? { stripeSubscriptionId: values.stripeSubscriptionId }
          : {}),
        status: values.status,
        // 未指定（undefined）のときは既知の期間終了を消さない。
        // checkout.session.completed は current_period_end を持たないため、
        // ここで null を書くと subscription.updated で得た値を消してしまう。
        ...(values.currentPeriodEnd !== undefined
          ? { currentPeriodEnd: values.currentPeriodEnd }
          : {}),
        ...(values.lastEventCreatedAt !== undefined
          ? { lastEventCreatedAt: values.lastEventCreatedAt }
          : {}),
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/**
 * Webhook イベントを処理済みとして記録する。新規なら true、
 * 記録済み（再送）なら false を返す（冪等性）。
 * 記録は処理の成功後に行う: 先に記録すると、処理が失敗したイベントが
 * Stripe の再送でも二度と適用されなくなってしまうため。
 */
export async function recordStripeEventIfNew(
  db: Db,
  eventId: string,
  type: string,
): Promise<boolean> {
  const inserted = await db
    .insert(stripeWebhookEventsTable)
    .values({ eventId, type })
    .onConflictDoNothing()
    .returning();
  return inserted.length === 1;
}

/** Webhook イベントが処理済みとして記録されているか。 */
export async function isStripeEventRecorded(db: Db, eventId: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(stripeWebhookEventsTable)
    .where(eq(stripeWebhookEventsTable.eventId, eventId));
  return row !== undefined;
}

/**
 * 現在の所有者のプランが有効か。status が有効でも、期間終了
 * （currentPeriodEnd）が過ぎていれば無効として扱う（Webhook の
 * 取りこぼしで canceled になっていない行を有効にし続けないため）。
 * currentPeriodEnd が未記録（null）の場合は status のみで判定する。
 */
export async function hasActivePlan(db: Db): Promise<boolean> {
  const row = await getSubscriptionRow(db);
  if (!row || !ACTIVE_PLAN_STATUSES.has(row.status)) return false;
  if (row.currentPeriodEnd && row.currentPeriodEnd.getTime() <= Date.now()) return false;
  return true;
}
