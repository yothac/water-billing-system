import { NextResponse } from "next/server";
import type { Payment, PaymentStatus } from "../../../types/water-system";
import {
  createSupabaseAdminClient,
  hasSupabaseAdminConfig,
} from "../../../lib/supabase-admin";

type DbRecord = Record<string, unknown>;

function toNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toString(value: unknown, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function toNullableString(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return String(value);
}

function toDateString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return new Date().toISOString();
}

function toPaymentStatus(value: unknown): PaymentStatus {
  return value === "cancelled" ? "cancelled" : "paid";
}

function dbToPayment(row: DbRecord): Payment {
  return {
    id: toString(row.id),
    billId: toString(row.bill_id),
    periodId: toNullableString(row.period_id),
    waterUserId: toNullableString(row.water_user_id),
    readingId: toNullableString(row.reading_id),
    amount: toNumber(row.amount, 0),
    paymentMethod: toNullableString(row.payment_method),
    paidAt: toDateString(row.paid_at),
    receiptNo: toNullableString(row.receipt_no),
    receiptBookNo: toNullableString(row.receipt_book_no),
    status: toPaymentStatus(row.status),
    note: toNullableString(row.note),
    createdAt: toDateString(row.created_at),
    updatedAt: toDateString(row.updated_at),
    cancelledAt: toNullableString(row.cancelled_at) || null,
  };
}

function paymentToDb(payment: Payment): DbRecord {
  return {
    id: payment.id,
    bill_id: payment.billId,
    period_id: payment.periodId || null,
    water_user_id: payment.waterUserId || null,
    reading_id: payment.readingId || null,
    amount: payment.amount || 0,
    payment_method: payment.paymentMethod || "cash",
    status: payment.status || "paid",
    paid_at: payment.paidAt || new Date().toISOString(),
    cancelled_at: payment.cancelledAt || null,
    receipt_no: payment.receiptNo || null,
    receipt_book_no: payment.receiptBookNo || null,
    note: payment.note || null,
    created_at: payment.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function getPaymentsFromSupabase() {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("paid_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as DbRecord[]).map(dbToPayment);
}

function missingConfigResponse() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "ยังไม่ได้ตั้งค่า Environment Variables ของ Supabase ให้ครบ: NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY",
    },
    { status: 503 }
  );
}

export async function GET() {
  if (!hasSupabaseAdminConfig()) {
    return missingConfigResponse();
  }

  try {
    const payments = await getPaymentsFromSupabase();

    return NextResponse.json({ ok: true, payments });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "โหลดข้อมูลรับชำระจาก Supabase ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminConfig()) {
    return missingConfigResponse();
  }

  try {
    const payment = (await request.json()) as Payment;

    if (!payment.id || !payment.billId) {
      return NextResponse.json(
        {
          ok: false,
          message: "ข้อมูลรับชำระไม่ครบ",
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("payments")
      .upsert(paymentToDb(payment), { onConflict: "id" });

    if (error) {
      throw new Error(error.message);
    }

    const payments = await getPaymentsFromSupabase();

    return NextResponse.json({
      ok: true,
      message: "บันทึกรับชำระเข้า Supabase สำเร็จ",
      payment,
      payments,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "บันทึกรับชำระเข้า Supabase ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
