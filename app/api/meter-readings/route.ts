import { NextResponse } from "next/server";
import type {
  BillingMode,
  BillingPeriod,
  BillingPeriodStatus,
  MeterReading,
  MeterStatus,
  UserStatus,
  UserStatusV4,
  WaterSettings,
  WaterUser,
} from "../../../types/water-system";
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
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function toNullableString(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function toNullableNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return toNumber(value, 0);
}

function toDateString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function toUserStatus(value: unknown): UserStatus {
  const text = String(value || "active");
  if (text === "inactive" || text === "cut") return text;
  return "active";
}

function toUserStatusV4(value: unknown): UserStatusV4 {
  const text = String(value || "ACTIVE");
  if (text === "SERVICE_ONLY" || text === "CUT") return text;
  return "ACTIVE";
}

function toBillingMode(value: unknown): BillingMode {
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

function toBillingPeriodStatus(value: unknown): BillingPeriodStatus {
  const text = String(value || "open");
  if (text === "closed" || text === "locked") return text;
  return "open";
}

function toMeterStatus(value: unknown): MeterStatus {
  const text = String(value || "normal");
  if (
    text === "backward" ||
    text === "rollover" ||
    text === "meter_replaced" ||
    text === "service_only" ||
    text === "disconnected_no_charge" ||
    text === "error"
  ) {
    return text;
  }
  return "normal";
}

function getFallbackCurrentPeriod(): BillingPeriod {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear() + 543;

  return {
    id: `period-${year}-${String(month).padStart(2, "0")}`,
    periodName: `${month}/${year}`,
    month,
    year,
    status: "open",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function dbToSettings(row: DbRecord | null | undefined): WaterSettings {
  return {
    villageName: toString(
      row?.village_name,
      "ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน"
    ),
    unitPrice: toNumber(row?.unit_price, 8),
    serviceFee: toNumber(row?.service_fee, 20),
    meterMaxValue: toNumber(row?.meter_max_value, 9999),
    receiptPrefix: toNullableString(row?.receipt_prefix),
    receiptBookNo: toNullableString(row?.receipt_book_no),
    receiptVillageLine: toNullableString(row?.receipt_village_line),
    defaultReceiptDay:
      row?.default_receipt_day === null || row?.default_receipt_day === undefined
        ? null
        : toNumber(row.default_receipt_day, 0),
    updatedAt: toNullableString(row?.updated_at),
  };
}

function dbToPeriod(row: DbRecord): BillingPeriod {
  return {
    id: toString(row.id),
    periodName: toString(row.period_name, toString(row.id)),
    month: toNumber(row.month, 0),
    year: toNumber(row.year, 0),
    status: toBillingPeriodStatus(row.status),
    closedAt: toNullableString(row.closed_at) || null,
    lockedAt: toNullableString(row.locked_at) || null,
    createdAt: toNullableString(row.created_at),
    updatedAt: toNullableString(row.updated_at),
  };
}

function dbToUser(row: DbRecord): WaterUser {
  return {
    id: toString(row.id),
    userCode: toString(row.user_code),
    legacyUserId: toNullableString(row.legacy_user_id) || null,
    fullName: toString(row.full_name, "ไม่ระบุชื่อ"),
    address: toString(row.address),
    addressCode: toNullableString(row.address_code) || null,
    villageNo: toString(row.village_no),
    phone: toNullableString(row.phone),
    status: toUserStatus(row.status),
    userStatus: toUserStatusV4(row.user_status),
    defaultBillingMode: toBillingMode(row.default_billing_mode),
    serviceOnly: Boolean(row.service_only),
    cutMeter: Boolean(row.cut_meter),
    serviceFeeOverride: toNullableNumber(row.service_fee_override),
    lastReading: toNumber(row.last_reading, 0),
    lastReadingText: toNullableString(row.last_reading_text),
    lastRecordDateLabel: toNullableString(row.last_record_date_label),
    note: toNullableString(row.note),
    createdAt: toDateString(row.created_at),
    updatedAt: toDateString(row.updated_at),
  };
}

function dbToReading(row: DbRecord): MeterReading {
  return {
    id: toNullableString(row.id),
    periodId: toString(row.period_id),
    waterUserId: toString(row.water_user_id),
    previousReading: toNumber(row.previous_reading, 0),
    currentReading: toNumber(row.current_reading, 0),
    usedUnits: toNumber(row.used_units, 0),
    unitPrice: toNumber(row.unit_price, 0),
    waterAmount: toNumber(row.water_amount, 0),
    serviceFee: toNumber(row.service_fee, 0),
    totalAmount: toNumber(row.total_amount, 0),
    billingMode: toBillingMode(row.billing_mode),
    meterStatus: toMeterStatus(row.meter_status),
    oldMeterFinalReading: toNullableNumber(row.old_meter_final_reading),
    oldMeterUnits: toNumber(row.old_meter_units, 0),
    newMeterUnits: toNumber(row.new_meter_units, 0),
    isRollover: Boolean(row.is_rollover),
    isBackward: Boolean(row.is_backward),
    meterMaxValue: toNumber(row.meter_max_value, 9999),
    note: toNullableString(row.note),
    recordedAt: toNullableString(row.recorded_at),
    createdAt: toNullableString(row.created_at),
    updatedAt: toNullableString(row.updated_at),
  };
}

function userToDb(user: WaterUser): DbRecord {
  return {
    id: user.id,
    user_code: user.userCode,
    legacy_user_id: user.legacyUserId || null,
    full_name: user.fullName,
    address: user.address || null,
    address_code: user.addressCode || null,
    village_no: user.villageNo || null,
    phone: user.phone || null,
    last_reading: user.lastReading || 0,
    last_reading_text: user.lastReadingText || null,
    last_record_date_label: user.lastRecordDateLabel || null,
    status: user.status || "active",
    user_status: user.userStatus || "ACTIVE",
    default_billing_mode: user.defaultBillingMode || "normal",
    service_only: Boolean(user.serviceOnly),
    cut_meter: Boolean(user.cutMeter),
    service_fee_override: user.serviceFeeOverride ?? null,
    note: user.note || null,
    created_at: user.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function readingToDb(reading: MeterReading): DbRecord {
  return {
    id: reading.id || `reading-${reading.periodId}-${reading.waterUserId}`,
    period_id: reading.periodId,
    water_user_id: reading.waterUserId,
    previous_reading: reading.previousReading || 0,
    current_reading: reading.currentReading || 0,
    used_units: reading.usedUnits || 0,
    unit_price: reading.unitPrice || 0,
    water_amount: reading.waterAmount || 0,
    service_fee: reading.serviceFee || 0,
    total_amount: reading.totalAmount || 0,
    billing_mode: reading.billingMode || "normal",
    meter_status: reading.meterStatus || "normal",
    old_meter_final_reading: reading.oldMeterFinalReading ?? null,
    old_meter_units: reading.oldMeterUnits || 0,
    new_meter_units: reading.newMeterUnits || 0,
    is_rollover: Boolean(reading.isRollover),
    is_backward: Boolean(reading.isBackward),
    meter_max_value: reading.meterMaxValue || 9999,
    note: reading.note || null,
    recorded_at: reading.recordedAt || new Date().toISOString(),
    created_at: reading.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function loadMeterData() {
  const supabase = createSupabaseAdminClient();

  const { data: settingsRow, error: settingsError } = await supabase
    .from("water_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (settingsError) throw new Error(settingsError.message);

  const { data: periodRow, error: periodError } = await supabase
    .from("billing_periods")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (periodError) throw new Error(periodError.message);

  const currentPeriod = periodRow
    ? dbToPeriod(periodRow as DbRecord)
    : getFallbackCurrentPeriod();

  const { data: usersRows, error: usersError } = await supabase
    .from("water_users")
    .select("*")
    .order("address", { ascending: true })
    .order("user_code", { ascending: true });

  if (usersError) throw new Error(usersError.message);

  const { data: readingRows, error: readingsError } = await supabase
    .from("meter_readings")
    .select("*")
    .order("period_id", { ascending: false })
    .order("created_at", { ascending: true });

  if (readingsError) throw new Error(readingsError.message);

  return {
    settings: dbToSettings((settingsRow || null) as DbRecord | null),
    currentPeriod,
    users: ((usersRows || []) as DbRecord[]).map(dbToUser),
    readings: ((readingRows || []) as DbRecord[]).map(dbToReading),
  };
}

export async function GET() {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "ยังไม่ได้ตั้งค่า Supabase ใน .env.local ให้ครบ: NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 503 }
    );
  }

  try {
    const data = await loadMeterData();

    return NextResponse.json({
      ok: true,
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "โหลดข้อมูลจดมิเตอร์จาก Supabase ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "ยังไม่ได้ตั้งค่า Supabase ใน .env.local ให้ครบ: NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 503 }
    );
  }

  try {
    const { reading, user } = (await request.json()) as {
      reading?: MeterReading;
      user?: WaterUser;
    };

    if (!reading || !user) {
      return NextResponse.json(
        {
          ok: false,
          message: "ข้อมูล reading/user ไม่ครบ",
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { error: readingError } = await supabase
      .from("meter_readings")
      .upsert(readingToDb(reading), { onConflict: "id" });

    if (readingError) throw new Error(readingError.message);

    const { error: userError } = await supabase
      .from("water_users")
      .upsert(userToDb(user), { onConflict: "id" });

    if (userError) throw new Error(userError.message);

    const data = await loadMeterData();

    return NextResponse.json({
      ok: true,
      message: "บันทึกจดมิเตอร์เข้า Supabase สำเร็จ",
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "บันทึกจดมิเตอร์เข้า Supabase ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
