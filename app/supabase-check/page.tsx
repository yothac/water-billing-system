"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface TableCheck {
  tableName: string;
  ok: boolean;
  count: number;
  error: string;
}

interface CheckResult {
  ok: boolean;
  message: string;
  error?: string;
  settingsCount?: number;
  tables?: TableCheck[];
}

export default function SupabaseCheckPage() {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function runCheck() {
    setIsLoading(true);

    try {
      const response = await fetch("/api/supabase-check", {
        cache: "no-store",
      });

      const data = (await response.json()) as CheckResult;

      setResult(data);
    } catch (error) {
      setResult({
        ok: false,
        message: "เรียก API ตรวจ Supabase ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    runCheck();
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 pb-24">
      <section className="bg-gradient-to-br from-slate-950 via-blue-900 to-cyan-700 px-4 pb-20 pt-5 text-white">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="text-sm font-bold text-blue-100">
            ← กลับหน้าหลัก
          </Link>

          <h1 className="mt-5 text-3xl font-black">Supabase Check</h1>

          <p className="mt-1 text-sm text-blue-100">
            ตรวจการเชื่อมต่อฐานข้อมูล Supabase และตารางหลัก
          </p>
        </div>
      </section>

      <section className="mx-auto -mt-12 max-w-5xl px-4">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                ผลตรวจ Supabase
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                ใช้ API route ฝั่ง server อ่านด้วย service role key
              </p>
            </div>

            <button
              onClick={runCheck}
              disabled={isLoading}
              className={
                isLoading
                  ? "rounded-2xl bg-slate-300 px-5 py-3 font-black text-white"
                  : "rounded-2xl bg-blue-600 px-5 py-3 font-black text-white"
              }
            >
              {isLoading ? "กำลังตรวจ..." : "ตรวจอีกครั้ง"}
            </button>
          </div>

          {!result ? (
            <div className="mt-5 rounded-3xl bg-slate-50 p-6 text-center font-bold text-slate-500">
              กำลังโหลดผลตรวจ
            </div>
          ) : (
            <div
              className={
                result.ok
                  ? "mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5"
                  : "mt-5 rounded-3xl border border-red-200 bg-red-50 p-5"
              }
            >
              <p
                className={
                  result.ok
                    ? "text-xl font-black text-emerald-700"
                    : "text-xl font-black text-red-700"
                }
              >
                {result.ok ? "เชื่อมต่อสำเร็จ" : "ยังไม่ผ่าน"}
              </p>

              <p className="mt-2 font-bold text-slate-700">{result.message}</p>

              {result.error ? (
                <pre className="mt-3 overflow-auto rounded-2xl bg-white p-4 text-sm text-red-700">
                  {result.error}
                </pre>
              ) : null}
            </div>
          )}

          {result?.tables ? (
            <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3">ตาราง</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3 text-right">จำนวนแถว</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>

                <tbody>
                  {result.tables.map((table) => (
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

                      <td className="px-4 py-3 text-red-700">
                        {table.error || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="mt-5 rounded-3xl bg-blue-50 p-5">
            <h3 className="font-black text-blue-900">ต้องตั้งค่า .env.local</h3>

            <p className="mt-2 text-sm font-bold leading-6 text-blue-700">
              ถ้ายังไม่ผ่าน ให้ตรวจว่าใส่ NEXT_PUBLIC_SUPABASE_URL,
              NEXT_PUBLIC_SUPABASE_ANON_KEY และ SUPABASE_SERVICE_ROLE_KEY ถูกต้อง
              แล้ว restart dev server ใหม่
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
