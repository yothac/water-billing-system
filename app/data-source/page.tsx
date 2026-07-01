"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  type DataSourceMode,
  getDataSourceMode,
  getDataSourceModeDescription,
  getDataSourceModeLabel,
  setDataSourceMode,
} from "../../lib/data-source";

interface SupabaseCheckTable {
  tableName: string;
  ok: boolean;
  count: number;
  error: string;
}

interface SupabaseCheckResult {
  ok: boolean;
  message: string;
  error?: string;
  tables?: SupabaseCheckTable[];
}

export default function DataSourcePage() {
  const [mode, setMode] = useState<DataSourceMode>("localStorage");
  const [isClientReady, setIsClientReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [supabaseCheck, setSupabaseCheck] =
    useState<SupabaseCheckResult | null>(null);

  async function runSupabaseCheck() {
    setIsChecking(true);

    try {
      const response = await fetch("/api/supabase-check", {
        cache: "no-store",
      });

      const data = (await response.json()) as SupabaseCheckResult;

      setSupabaseCheck(data);
    } catch (error) {
      setSupabaseCheck({
        ok: false,
        message: "ตรวจ Supabase ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsChecking(false);
    }
  }

  function handleChangeMode(nextMode: DataSourceMode) {
    setDataSourceMode(nextMode);
    setMode(nextMode);
  }

  useEffect(() => {
    setMode(getDataSourceMode());
    setIsClientReady(true);
    runSupabaseCheck();
  }, []);

  const canUseSupabase = Boolean(supabaseCheck?.ok);

  return (
    <main className="min-h-screen bg-slate-100 pb-24">
      <section className="bg-gradient-to-br from-slate-950 via-violet-900 to-blue-700 px-4 pb-20 pt-5 text-white">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="text-sm font-bold text-blue-100">
            ← กลับหน้าหลัก
          </Link>

          <h1 className="mt-5 text-3xl font-black">Data Source Switch</h1>

          <p className="mt-1 text-sm text-blue-100">
            เลือกแหล่งข้อมูลระหว่าง LocalStorage และ Supabase
          </p>
        </div>
      </section>

      <section className="mx-auto -mt-12 max-w-5xl px-4">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          {!isClientReady ? (
            <div className="rounded-3xl bg-slate-50 p-6 text-center font-black text-slate-500">
              กำลังโหลดสถานะแหล่งข้อมูล...
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
                <p className="text-sm font-black text-blue-700">
                  แหล่งข้อมูลที่เลือกอยู่ตอนนี้
                </p>

                <p className="mt-2 text-4xl font-black text-blue-950">
                  {getDataSourceModeLabel(mode)}
                </p>

                <p className="mt-2 text-sm font-bold leading-6 text-blue-700">
                  {getDataSourceModeDescription(mode)}
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <button
                  onClick={() => handleChangeMode("localStorage")}
                  className={
                    mode === "localStorage"
                      ? "rounded-3xl border-2 border-emerald-500 bg-emerald-50 p-5 text-left shadow-sm"
                      : "rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm"
                  }
                >
                  <p className="text-2xl font-black text-slate-900">
                    LocalStorage
                  </p>

                  <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                    ใช้ข้อมูลใน Browser เครื่องนี้ เหมาะกับโหมด V4 เดิม และเป็นโหมดปลอดภัยสุด
                  </p>

                  <span
                    className={
                      mode === "localStorage"
                        ? "mt-4 inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-black text-white"
                        : "mt-4 inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600"
                    }
                  >
                    {mode === "localStorage" ? "กำลังใช้งาน" : "เลือกโหมดนี้"}
                  </span>
                </button>

                <button
                  onClick={() => handleChangeMode("supabase")}
                  disabled={!canUseSupabase}
                  className={
                    !canUseSupabase
                      ? "rounded-3xl border border-slate-200 bg-slate-50 p-5 text-left opacity-60"
                      : mode === "supabase"
                        ? "rounded-3xl border-2 border-blue-500 bg-blue-50 p-5 text-left shadow-sm"
                        : "rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm"
                  }
                >
                  <p className="text-2xl font-black text-slate-900">Supabase</p>

                  <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                    ใช้ฐานข้อมูลออนไลน์ หลังจากย้ายหน้าเว็บแต่ละหน้าไป Repository แล้ว
                  </p>

                  <span
                    className={
                      !canUseSupabase
                        ? "mt-4 inline-flex rounded-full bg-slate-200 px-4 py-2 text-sm font-black text-slate-500"
                        : mode === "supabase"
                          ? "mt-4 inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white"
                          : "mt-4 inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600"
                    }
                  >
                    {!canUseSupabase
                      ? "ยังใช้ไม่ได้"
                      : mode === "supabase"
                        ? "กำลังใช้งาน"
                        : "เลือกโหมดนี้"}
                  </span>
                </button>
              </div>

              <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <h2 className="font-black text-amber-800">
                  หมายเหตุช่วงย้ายระบบ
                </h2>

                <p className="mt-2 text-sm font-bold leading-6 text-amber-700">
                  หน้านี้เป็นตัวล็อกโหมดแหล่งข้อมูลก่อนเริ่มย้ายทีละหน้า
                  ระบบหลักบางหน้ายังอ่าน LocalStorage อยู่จนกว่าจะย้ายเสร็จในขั้นตอนถัดไป
                </p>
              </div>

              <div className="mt-5 rounded-3xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">
                      Supabase Status
                    </h2>

                    <p className="mt-1 text-sm font-bold text-slate-500">
                      ใช้เช็กว่าสามารถเปิดโหมด Supabase ได้หรือไม่
                    </p>
                  </div>

                  <button
                    onClick={runSupabaseCheck}
                    disabled={isChecking}
                    className={
                      isChecking
                        ? "rounded-2xl bg-slate-300 px-5 py-3 font-black text-white"
                        : "rounded-2xl bg-blue-600 px-5 py-3 font-black text-white"
                    }
                  >
                    {isChecking ? "กำลังตรวจ..." : "ตรวจอีกครั้ง"}
                  </button>
                </div>

                {supabaseCheck ? (
                  <div
                    className={
                      supabaseCheck.ok
                        ? "mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
                        : "mt-4 rounded-2xl border border-red-200 bg-red-50 p-4"
                    }
                  >
                    <p
                      className={
                        supabaseCheck.ok
                          ? "font-black text-emerald-700"
                          : "font-black text-red-700"
                      }
                    >
                      {supabaseCheck.ok
                        ? "Supabase พร้อมใช้งาน"
                        : "Supabase ยังไม่พร้อม"}
                    </p>

                    <p className="mt-1 text-sm font-bold text-slate-600">
                      {supabaseCheck.message}
                    </p>

                    {supabaseCheck.error ? (
                      <pre className="mt-3 overflow-auto rounded-xl bg-white p-3 text-sm text-red-700">
                        {supabaseCheck.error}
                      </pre>
                    ) : null}
                  </div>
                ) : null}

                {supabaseCheck?.tables ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full min-w-[520px] border-collapse text-sm">
                      <thead className="bg-slate-50 text-left text-slate-600">
                        <tr>
                          <th className="px-4 py-3">ตาราง</th>
                          <th className="px-4 py-3">สถานะ</th>
                          <th className="px-4 py-3 text-right">จำนวนแถว</th>
                        </tr>
                      </thead>

                      <tbody>
                        {supabaseCheck.tables.map((table) => (
                          <tr
                            key={table.tableName}
                            className="border-t border-slate-100"
                          >
                            <td className="px-4 py-3 font-black">
                              {table.tableName}
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={
                                  table.ok
                                    ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"
                                    : "rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700"
                                }
                              >
                                {table.ok ? "ผ่าน" : "ไม่ผ่าน"}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-right font-black">
                              {table.count.toLocaleString("th-TH")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/supabase-repository-check"
                  className="rounded-2xl bg-slate-900 px-5 py-4 font-black text-white"
                >
                  ตรวจ Repository
                </Link>

                <Link
                  href="/supabase-check"
                  className="rounded-2xl bg-blue-600 px-5 py-4 font-black text-white"
                >
                  ตรวจ Supabase
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
