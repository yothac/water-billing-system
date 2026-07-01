import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  hasSupabaseAdminConfig,
} from "../../../lib/supabase-admin";

type AnyRecord = Record<string, unknown>;

function toNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toStringOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function toIsoOrNow(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function getArray(data: AnyRecord, key: string) {
  const value = data[key];
  return Array.isArray(value) ? (value as AnyRecord[]) : [];
}

function makePeriodId(year: number, month: number) {
  return `period-${year}-${String(month).padStart(2, "0")}`;
}

function normalizeStatus(value: unknown) {
  const text = String(value || "active").toLowerCase();
  if (text === "inactive") return "inactive";
  if (text === "cut") return "cut";
  return "active";
}

function normalizeUserStatus(value: unknown) {
  const text = String(value || "ACTIVE").toUpperCase();
  if (text === "SERVICE_ONLY") return "SERVICE_ONLY";
  if (text === "CUT") return "CUT";
  return "ACTIVE";
}

function normalizeBillingMode(value: unknown) {
  const text = String(value || "normal");
  if (
    text === "service_only" ||
    text === "meter_replaced" ||
    text === "disconnected_no_charge"
  ) {
    return text;
  }
  return "normal";
}

function normalizePeriodStatus(value: unknown) {
  const text = String(value || "open");
  if (text === "closed" || text === "locked") return text;
  return "open";
}

function normalizePaymentMethod(value: unknown) {
  const text = String(value || "cash");
  if (text === "transfer" || text === "other") return text;
  return "cash";
}

function normalizePaymentStatus(value: unknown) {
  const text = String(value || "paid");
  if (text === "cancelled") return "cancelled";
  return "paid";
}

function mapSettings(data: AnyRecord) {
  const settings = (data.settings || {}) as AnyRecord;

  return {
    id: "default",
    village_name: String(
      settings.villageName ||
        settings.village_name ||
        "ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน"
    ),
    unit_price: toNumber(settings.unitPrice ?? settings.unit_price, 8),
    service_fee: toNumber(settings.serviceFee ?? settings.service_fee, 20),
    meter_max_value: Math.trunc(
      toNumber(settings.meterMaxValue ?? settings.meter_max_value, 9999)
    ),
    receipt_prefix:
      toStringOrNull(settings.receiptPrefix ?? settings.receipt_prefix) || "WR",
    receipt_book_no: toStringOrNull(
      settings.receiptBookNo ?? settings.receipt_book_no
    ),
    receipt_village_line: toStringOrNull(
      settings.receiptVillageLine ?? settings.receipt_village_line
    ),
    default_receipt_day:
      settings.defaultReceiptDay || settings.default_receipt_day
        ? Math.trunc(
            toNumber(
              settings.defaultReceiptDay ?? settings.default_receipt_day,
              0
            )
          )
        : null,
    updated_at: new Date().toISOString(),
  };
}

function mapPeriod(period: AnyRecord) {
  const month = Math.trunc(toNumber(period.month, new Date().getMonth() + 1));
  const year = Math.trunc(toNumber(period.year, new Date().getFullYear() + 543));
  const id = String(period.id || makePeriodId(year, month));

  return {
    id,
    period_name: String(period.periodName || period.period_name || id),
    month,
    year,
    status: normalizePeriodStatus(period.status),
    closed_at: toStringOrNull(period.closedAt ?? period.closed_at),
    locked_at: toStringOrNull(period.lockedAt ?? period.locked_at),
    created_at: toIsoOrNow(period.createdAt ?? period.created_at),
    updated_at: toIsoOrNow(period.updatedAt ?? period.updated_at),
  };
}

function mapUser(user: AnyRecord) {
  const id = String(
    user.id || user.userId || user.userCode || user.user_code || randomUUID()
  );
  const serviceOnly = Boolean(user.serviceOnly || user.service_only);
  const cutMeter = Boolean(user.cutMeter || user.cut_meter);

  return {
    id,
    user_code: String(user.userCode || user.code || user.user_code || id),
    legacy_user_id: toStringOrNull(user.legacyUserId ?? user.legacy_user_id),
    full_name: String(
      user.fullName || user.name || user.full_name || "ไม่ระบุชื่อ"
    ),
    address: toStringOrNull(user.address),
    address_code: toStringOrNull(user.addressCode ?? user.address_code),
    village_no: toStringOrNull(user.villageNo ?? user.village_no),
    phone: toStringOrNull(user.phone),
    last_reading: toNumber(user.lastReading ?? user.last_reading, 0),
    last_reading_text: toStringOrNull(
      user.lastReadingText ?? user.last_reading_text
    ),
    last_record_date_label: toStringOrNull(
      user.lastRecordDateLabel ?? user.last_record_date_label
    ),
    status: cutMeter ? "cut" : normalizeStatus(user.status),
    user_status: cutMeter
      ? "CUT"
      : serviceOnly
        ? "SERVICE_ONLY"
        : normalizeUserStatus(user.userStatus ?? user.user_status),
    default_billing_mode: serviceOnly
      ? "service_only"
      : normalizeBillingMode(user.defaultBillingMode ?? user.default_billing_mode),
    service_only: serviceOnly,
    cut_meter: cutMeter,
    service_fee_override:
      user.serviceFeeOverride || user.service_fee_override
        ? toNumber(user.serviceFeeOverride ?? user.service_fee_override, 0)
        : null,
    note: toStringOrNull(user.note),
    created_at: toIsoOrNow(user.createdAt ?? user.created_at),
    updated_at: toIsoOrNow(user.updatedAt ?? user.updated_at),
  };
}

function mapReading(reading: AnyRecord) {
  const periodId = String(reading.periodId || reading.period_id || "");
  const waterUserId = String(reading.waterUserId || reading.water_user_id || "");

  return {
    id: String(reading.id || `reading-${periodId}-${waterUserId}`),
    period_id: periodId,
    water_user_id: waterUserId,
    previous_reading: toNumber(reading.previousReading ?? reading.previous_reading, 0),
    current_reading: toNumber(reading.currentReading ?? reading.current_reading, 0),
    used_units: toNumber(reading.usedUnits ?? reading.used_units, 0),
    unit_price: toNumber(reading.unitPrice ?? reading.unit_price, 0),
    water_amount: toNumber(reading.waterAmount ?? reading.water_amount, 0),
    service_fee: toNumber(reading.serviceFee ?? reading.service_fee, 0),
    total_amount: toNumber(reading.totalAmount ?? reading.total_amount, 0),
    billing_mode: normalizeBillingMode(reading.billingMode ?? reading.billing_mode),
    meter_status: String(reading.meterStatus || reading.meter_status || "normal"),
    old_meter_final_reading:
      reading.oldMeterFinalReading || reading.old_meter_final_reading
        ? toNumber(reading.oldMeterFinalReading ?? reading.old_meter_final_reading, 0)
        : null,
    old_meter_units:
      reading.oldMeterUnits || reading.old_meter_units
        ? toNumber(reading.oldMeterUnits ?? reading.old_meter_units, 0)
        : null,
    new_meter_units:
      reading.newMeterUnits || reading.new_meter_units
        ? toNumber(reading.newMeterUnits ?? reading.new_meter_units, 0)
        : null,
    is_rollover: Boolean(reading.isRollover ?? reading.is_rollover),
    is_backward: Boolean(reading.isBackward ?? reading.is_backward),
    meter_max_value: Math.trunc(
      toNumber(reading.meterMaxValue ?? reading.meter_max_value, 9999)
    ),
    note: toStringOrNull(reading.note),
    recorded_at: toIsoOrNow(reading.recordedAt ?? reading.recorded_at),
    created_at: toIsoOrNow(reading.createdAt ?? reading.created_at),
    updated_at: toIsoOrNow(reading.updatedAt ?? reading.updated_at),
  };
}

function mapPayment(payment: AnyRecord) {
  const periodId = String(payment.periodId || payment.period_id || "");
  const waterUserId = String(payment.waterUserId || payment.water_user_id || "");
  const billId =
    String(payment.billId || payment.bill_id || "") ||
    `bill-${periodId}-${waterUserId}`;

  return {
    id: String(payment.id || `payment-${billId}`),
    bill_id: billId,
    period_id: periodId,
    water_user_id: waterUserId,
    reading_id: toStringOrNull(payment.readingId ?? payment.reading_id),
    amount: toNumber(payment.amount, 0),
    payment_method: normalizePaymentMethod(
      payment.paymentMethod ?? payment.payment_method
    ),
    status: normalizePaymentStatus(payment.status),
    paid_at: toIsoOrNow(payment.paidAt ?? payment.paid_at),
    cancelled_at: toStringOrNull(payment.cancelledAt ?? payment.cancelled_at),
    receipt_no: toStringOrNull(payment.receiptNo ?? payment.receipt_no),
    receipt_book_no: toStringOrNull(payment.receiptBookNo ?? payment.receipt_book_no),
    note: toStringOrNull(payment.note),
    created_at: toIsoOrNow(payment.createdAt ?? payment.created_at),
    updated_at: toIsoOrNow(payment.updatedAt ?? payment.updated_at),
  };
}

async function upsertOrFail(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  tableName: string,
  rows: AnyRecord | AnyRecord[],
  onConflict: string
) {
  const payload = Array.isArray(rows) ? rows : [rows];

  if (payload.length === 0) {
    return { tableName, count: 0 };
  }

  const { error } = await supabase.from(tableName).upsert(payload, {
    onConflict,
  });

  if (error) {
    throw new Error(`${tableName}: ${error.message}`);
  }

  return { tableName, count: payload.length };
}

function makeMissingPeriod(periodId: string) {
  const parts = periodId.split("-");
  const year = Number(parts[1]) || new Date().getFullYear() + 543;
  const month = Number(parts[2]) || 1;

  return {
    id: periodId,
    period_name: periodId,
    month,
    year,
    status: "open",
    closed_at: null,
    locked_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "ยังไม่ได้ตั้งค่า .env.local: NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 500 }
    );
  }

  try {
    const backup = (await request.json()) as AnyRecord;
    const supabase = createSupabaseAdminClient();

    const rawCurrentPeriod = (backup.currentPeriod || {}) as AnyRecord;
    const rawBillingPeriods = getArray(backup, "billingPeriods");

    const periodMap = new Map<string, AnyRecord>();

    rawBillingPeriods.forEach((period) => {
      const mapped = mapPeriod(period);
      periodMap.set(String(mapped.id), mapped);
    });

    if (Object.keys(rawCurrentPeriod).length > 0) {
      const mappedCurrentPeriod = mapPeriod(rawCurrentPeriod);
      periodMap.set(String(mappedCurrentPeriod.id), mappedCurrentPeriod);
    }

    const users = getArray(backup, "users").map(mapUser);
    const readings = getArray(backup, "readings")
      .map(mapReading)
      .filter((reading) => reading.period_id && reading.water_user_id);
    const payments = getArray(backup, "payments")
      .map(mapPayment)
      .filter((payment) => payment.period_id && payment.water_user_id);

    readings.forEach((reading) => {
      if (!periodMap.has(reading.period_id)) {
        periodMap.set(reading.period_id, makeMissingPeriod(reading.period_id));
      }
    });

    payments.forEach((payment) => {
      if (!periodMap.has(payment.period_id)) {
        periodMap.set(payment.period_id, makeMissingPeriod(payment.period_id));
      }
    });

    const results = [];

    results.push(
      await upsertOrFail(supabase, "water_settings", mapSettings(backup), "id")
    );
    results.push(
      await upsertOrFail(
        supabase,
        "billing_periods",
        Array.from(periodMap.values()),
        "id"
      )
    );
    results.push(await upsertOrFail(supabase, "water_users", users, "id"));
    results.push(await upsertOrFail(supabase, "meter_readings", readings, "id"));
    results.push(await upsertOrFail(supabase, "payments", payments, "id"));

    await supabase.from("audit_logs").insert({
      action: "IMPORT_BACKUP_JSON",
      table_name: "all",
      note: "นำเข้า Backup JSON จาก localStorage MVP V4",
      new_data: {
        users: users.length,
        readings: readings.length,
        payments: payments.length,
        periods: periodMap.size,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "นำเข้า Supabase สำเร็จ",
      results,
      summary: {
        users: users.length,
        readings: readings.length,
        payments: payments.length,
        periods: periodMap.size,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "นำเข้า Supabase ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
