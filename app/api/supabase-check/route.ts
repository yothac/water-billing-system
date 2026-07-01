import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  hasSupabaseAdminConfig,
} from "../../../lib/supabase-admin";

export async function GET() {
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
    const supabase = createSupabaseAdminClient();

    const { data: settings, error: settingsError } = await supabase
      .from("water_settings")
      .select("*")
      .limit(1);

    if (settingsError) {
      return NextResponse.json(
        {
          ok: false,
          message: "เชื่อมต่อ Supabase ได้ แต่ query water_settings ไม่ผ่าน",
          error: settingsError.message,
        },
        { status: 500 }
      );
    }

    const tables = [
      "water_settings",
      "billing_periods",
      "water_users",
      "meter_readings",
      "payments",
      "audit_logs",
    ];

    const tableChecks = await Promise.all(
      tables.map(async (tableName) => {
        const { count, error } = await supabase
          .from(tableName)
          .select("*", { count: "exact", head: true });

        return {
          tableName,
          ok: !error,
          count: count ?? 0,
          error: error?.message || "",
        };
      })
    );

    const failedTables = tableChecks.filter((item) => !item.ok);

    return NextResponse.json({
      ok: failedTables.length === 0,
      message:
        failedTables.length === 0
          ? "Supabase เชื่อมต่อสำเร็จ และพบตารางครบ"
          : "Supabase เชื่อมต่อได้ แต่บางตารางตรวจไม่ผ่าน",
      settingsCount: settings?.length || 0,
      tables: tableChecks,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "เชื่อมต่อ Supabase ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
