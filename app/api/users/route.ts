import { NextResponse } from "next/server";
import type {
  BillingMode,
  UserStatus,
  UserStatusV4,
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

function toNullableNumber(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return toNumber(value, 0);
}

function toDateString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return new Date().toISOString();
}

function toUserStatus(value: unknown): UserStatus {
  const text = String(value || "active");

  if (text === "inactive" || text === "cut") {
    return text;
  }

  return "active";
}

function toUserStatusV4(value: unknown): UserStatusV4 {
  const text = String(value || "ACTIVE");

  if (text === "SERVICE_ONLY" || text === "CUT") {
    return text;
  }

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

function dbToWaterUser(row: DbRecord): WaterUser {
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

function waterUserToDb(user: WaterUser): DbRecord {
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

async function getUsersFromSupabase() {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("water_users")
    .select("*")
    .order("address", { ascending: true })
    .order("user_code", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as DbRecord[]).map(dbToWaterUser);
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
    const users = await getUsersFromSupabase();

    return NextResponse.json({
      ok: true,
      users,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "โหลดรายชื่อผู้ใช้น้ำจาก Supabase ไม่สำเร็จ",
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
    const user = (await request.json()) as WaterUser;
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from("water_users")
      .upsert(waterUserToDb(user), { onConflict: "id" });

    if (error) {
      throw new Error(error.message);
    }

    const users = await getUsersFromSupabase();

    return NextResponse.json({
      ok: true,
      message: "บันทึกผู้ใช้น้ำเข้า Supabase สำเร็จ",
      user,
      users,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "บันทึกผู้ใช้น้ำเข้า Supabase ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
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
    const { id } = (await request.json()) as { id?: string };

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          message: "ไม่พบ id ผู้ใช้น้ำ",
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase.from("water_users").delete().eq("id", id);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ลบผู้ใช้น้ำไม่สำเร็จ อาจมีรายการจดมิเตอร์หรือรับชำระที่อ้างอิงอยู่",
          error: error.message,
        },
        { status: 500 }
      );
    }

    const users = await getUsersFromSupabase();

    return NextResponse.json({
      ok: true,
      message: "ลบผู้ใช้น้ำจาก Supabase สำเร็จ",
      users,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "ลบผู้ใช้น้ำจาก Supabase ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
