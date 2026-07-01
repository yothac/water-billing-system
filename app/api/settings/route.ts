import { NextResponse } from "next/server";
import type {
  BillingPeriod,
  BillingPeriodStatus,
  WaterSettings,
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

function toPeriodStatus(value: unknown): BillingPeriodStatus {
  if (value === "closed" || value === "locked") {
    return value;
  }

  return "open";
}

function settingsToDb(settings: WaterSettings): DbRecord {
  return {
    id: "default",
    village_name: settings.villageName,
    unit_price: settings.unitPrice || 8,
    service_fee: settings.serviceFee || 20,
    meter_max_value: settings.meterMaxValue || 9999,
    receipt_prefix: settings.receiptPrefix || "WR",
    receipt_book_no: settings.receiptBookNo || null,
    receipt_village_line: settings.receiptVillageLine || null,
    default_receipt_day: settings.defaultReceiptDay ?? null,
    updated_at: new Date().toISOString(),
  };
}

function dbToSettings(row: DbRecord | null | undefined): WaterSettings {
  return {
    villageName: toString(row?.village_name, "ระบบประปาหมู่บ้าน"),
    unitPrice: toNumber(row?.unit_price, 8),
    serviceFee: toNumber(row?.service_fee, 20),
    meterMaxValue: toNumber(row?.meter_max_value, 9999),
    receiptPrefix: toNullableString(row?.receipt_prefix),
    receiptBookNo: toNullableString(row?.receipt_book_no),
    receiptVillageLine: toNullableString(row?.receipt_village_line),
    defaultReceiptDay:
      row?.default_receipt_day === undefined || row?.default_receipt_day === null
        ? null
        : toNumber(row.default_receipt_day, 0),
    createdAt: toNullableString(row?.created_at),
    updatedAt: toNullableString(row?.updated_at),
  };
}

function periodToDb(period: BillingPeriod): DbRecord {
  return {
    id: period.id,
    period_name: period.periodName,
    month: period.month || 1,
    year: period.year || 2569,
    status: period.status || "open",
    opened_at: period.openedAt || null,
    closed_at: period.closedAt || null,
    locked_at: period.lockedAt || null,
    created_at: period.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function dbToPeriod(row: DbRecord): BillingPeriod {
  return {
    id: toString(row.id),
    periodName: toString(row.period_name, toString(row.id)),
    month: toNumber(row.month, 1),
    year: toNumber(row.year, 2569),
    status: toPeriodStatus(row.status),
    openedAt: toNullableString(row.opened_at) || null,
    closedAt: toNullableString(row.closed_at) || null,
    lockedAt: toNullableString(row.locked_at) || null,
    createdAt: toNullableString(row.created_at),
    updatedAt: toNullableString(row.updated_at),
  };
}

function missingConfigResponse() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "ยังไม่ได้ตั้งค่า Supabase ใน .env.local ให้ครบ: NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY",
    },
    { status: 503 }
  );
}

async function loadSettingsData() {
  const supabase = createSupabaseAdminClient();

  const { data: settingsRow, error: settingsError } = await supabase
    .from("water_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const { data: periodRow, error: periodError } = await supabase
    .from("billing_periods")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (periodError) {
    throw new Error(periodError.message);
  }

  return {
    settings: dbToSettings((settingsRow || null) as DbRecord | null),
    currentPeriod: periodRow ? dbToPeriod(periodRow as DbRecord) : null,
  };
}

export async function GET() {
  if (!hasSupabaseAdminConfig()) {
    return missingConfigResponse();
  }

  try {
    const data = await loadSettingsData();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "โหลดตั้งค่าจาก Supabase ไม่สำเร็จ",
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
    const body = (await request.json()) as {
      settings?: WaterSettings;
      currentPeriod?: BillingPeriod;
    };

    if (!body.settings || !body.currentPeriod) {
      return NextResponse.json(
        { ok: false, message: "ข้อมูลตั้งค่า/รอบบิลไม่ครบ" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { error: settingsError } = await supabase
      .from("water_settings")
      .upsert(settingsToDb(body.settings), { onConflict: "id" });

    if (settingsError) {
      throw new Error(settingsError.message);
    }

    const { error: periodError } = await supabase
      .from("billing_periods")
      .upsert(periodToDb(body.currentPeriod), { onConflict: "id" });

    if (periodError) {
      throw new Error(periodError.message);
    }

    const data = await loadSettingsData();

    return NextResponse.json({
      ok: true,
      message: "บันทึกตั้งค่าเข้า Supabase สำเร็จ",
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "บันทึกตั้งค่าเข้า Supabase ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
