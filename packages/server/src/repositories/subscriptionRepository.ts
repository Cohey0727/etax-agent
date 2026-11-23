/**
 * subscriptionRepository.ts — 課金状態（Stripe サブスクリプション）の
 * 読み書き（repositories）。所有者ごとに1件。
 */
import { eq } from "drizzle-orm";
import { Db } from "../lib/db";
import { ownerIdForWrite } from "../lib/tenantContext";
import { SubscriptionRow, subscriptionsTable } from "./schema";

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
  },
): Promise<SubscriptionRow> {
  const insert = {
    ownerUserId,
    stripeCustomerId: values.stripeCustomerId ?? "",
    stripeSubscriptionId: values.stripeSubscriptionId ?? "",
    status: values.status,
    currentPeriodEnd: values.currentPeriodEnd ?? null,
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
        currentPeriodEnd: values.currentPeriodEnd ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/** 現在の所有者のプランが有効か。 */
export async function hasActivePlan(db: Db): Promise<boolean> {
  const row = await getSubscriptionRow(db);
  return row !== undefined && ACTIVE_PLAN_STATUSES.has(row.status);
}
