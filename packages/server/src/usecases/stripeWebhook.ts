/**
 * stripeWebhook.ts — Stripe Webhook を受けて課金状態を同期する（usecases）。
 * 認証は署名検証（STRIPE_WEBHOOK_SECRET）が担うため、セッション認証の
 * 対象外パスとして登録する。
 */
import { createRoute, RouteHandler, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { verifyWebhookSignature } from "../gateways/stripeGateway";
import { getDb } from "../lib/db";
import {
  getSubscriptionByCustomerId,
  getSubscriptionRow,
  isStripeEventRecorded,
  recordStripeEventIfNew,
  upsertSubscriptionRow,
} from "../repositories/subscriptionRepository";

export const stripeWebhookRoute = createRoute({
  method: "post",
  path: "/api/billing/webhook",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ received: z.boolean() }) } },
      description: "受信した",
    },
  },
});

interface StripeObject {
  id?: string;
  customer?: string;
  subscription?: string;
  status?: string;
  payment_status?: string;
  current_period_end?: number;
  client_reference_id?: string;
  metadata?: Record<string, string>;
}

function periodEnd(sec: number | undefined): Date | null {
  return typeof sec === "number" ? new Date(sec * 1000) : null;
}

/** イベントの作成時刻（順序逆転の判定用）。数値でなければ null。 */
function eventCreatedDate(sec: number | undefined): Date | null {
  return typeof sec === "number" && Number.isFinite(sec) ? new Date(sec * 1000) : null;
}

export const stripeWebhookHandler: RouteHandler<typeof stripeWebhookRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HTTPException(503, { message: "Webhook が設定されていません" });
  const payload = await c.req.text();
  if (!verifyWebhookSignature(payload, c.req.header("stripe-signature"), secret)) {
    throw new HTTPException(400, { message: "署名が不正です" });
  }
  const event = JSON.parse(payload) as {
    id?: string;
    type?: string;
    created?: number;
    data?: { object?: StripeObject };
  };
  const obj = event.data?.object ?? {};
  const customerId = typeof obj.customer === "string" ? obj.customer : "";
  const eventCreated = eventCreatedDate(event.created);

  // 冪等性: 処理済みのイベントの再送は何もしない（Issue #8）。
  // 記録は処理の成功後に行う（失敗したイベントは再送で回復できるように）。
  const eventId = typeof event.id === "string" && event.id !== "" ? event.id : null;
  if (eventId && (await isStripeEventRecorded(db, eventId))) {
    return c.json({ received: true });
  }

  // 順序逆転への耐性: 適用済みのイベントより古いイベントでは上書きしない。
  const isStale = (lastEventCreatedAt: Date | null | undefined): boolean =>
    Boolean(
      eventCreated &&
        lastEventCreatedAt &&
        eventCreated.getTime() < lastEventCreatedAt.getTime(),
    );

  if (event.type === "checkout.session.completed") {
    // 支払いが完了していないセッション（payment_status が unpaid 等）では
    // プランを有効化しない。トライアル等で支払い不要な場合は
    // no_payment_required が来るので、それは有効化してよい。
    const paymentStatus = obj.payment_status;
    const userId = Number(obj.client_reference_id ?? obj.metadata?.user_id);
    if (
      (paymentStatus === "paid" || paymentStatus === "no_payment_required") &&
      Number.isInteger(userId) &&
      userId > 0
    ) {
      const existing = await getSubscriptionRow(db, userId);
      if (!isStale(existing?.lastEventCreatedAt)) {
        await upsertSubscriptionRow(db, userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: typeof obj.subscription === "string" ? obj.subscription : "",
          status: "active",
          ...(eventCreated ? { lastEventCreatedAt: eventCreated } : {}),
        });
      }
    }
  } else if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const existing = customerId ? await getSubscriptionByCustomerId(db, customerId) : undefined;
    const userId = existing?.ownerUserId ?? Number(obj.metadata?.user_id);
    if (Number.isInteger(userId) && userId > 0 && !isStale(existing?.lastEventCreatedAt)) {
      await upsertSubscriptionRow(db, userId, {
        stripeCustomerId: customerId || undefined,
        stripeSubscriptionId: typeof obj.id === "string" ? obj.id : undefined,
        status:
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : (obj.status ?? "active"),
        currentPeriodEnd: periodEnd(obj.current_period_end),
        ...(eventCreated ? { lastEventCreatedAt: eventCreated } : {}),
      });
    }
  }
  // 処理が済んだイベントとして記録する（再送の冪等性）。
  if (eventId) await recordStripeEventIfNew(db, eventId, event.type ?? "");
  return c.json({ received: true });
};
