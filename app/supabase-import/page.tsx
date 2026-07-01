"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { exportAllData } from "../../lib/local-store";
import type { BackupData } from "../../types/water-system";

interface ImportResult {
  ok: boolean;
  message: string;
  error?: string;
  summary?: {
    users: number;
    readings: number;
    payments: number;
    periods: number;
  };
  results?: {
    tableName: string;
    count: number;
  }[];
}

export default function SupabaseImportPage() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [localBackup, setLocalBackup] = useState<BackupData | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);

  useEffect(() => {
    try {
      setLocalBackup(exportAllData());
    } catch {
      setLocalBackup(null);
    } finally {
      setIsClientReady(true);
    }
  }, []);

  const localSummary = useMemo(
    () => ({
      users: localBackup?.users?.length || 0,
      readings: localBackup?.readings?.length || 0,
      payments: localBackup?.payments?.length || 0,
      currentPeriod: localBackup?.currentPeriod?.periodName || "-",
    }),
    [localBackup]
  );

  async function importPayload(payload: unknown) {
    setIsImporting(true);
    setResult(null);

    try {
      const response = await fetch("/api/supabase-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as ImportResult;

      setResult(data);
    } catch (error) {
      setResult({
        ok: false,
        message: "เรียก API import ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsImporting(false);
    }
  }

  async function importFromLocalStorage() {
    const backup = exportAllData();
    setLocalBackup(backup);

    await importPayload(backup);
  }

  async function importFromJsonText() {
    try {
      const parsed = JSON.parse(jsonText);

      await importPayload(parsed);
    } catch (error) {
      setResult({
        ok: false,
        message: "JSON ไม่ถูกต้อง",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleFileUpload(file: File | null) {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      setJsonText(text);
      await importPayload(parsed);
    } catch (error) {
      setResult({
        ok: false,
        message: "อ่านไฟล์ JSON ไม่สำเร็จ",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-24">
      <section className="bg-gradient-to-br from-emerald-950 via-green-800 to-lime-600 px-4 pb-20 pt-5 text-white">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="text-sm font-bold text-emerald-100">
            ← กลับหน้าหลัก
          </Link>

          <h1 className="mt-5 text-3xl font-black">Import to Supabase</h1>

          <p className="mt-1 text-sm text-emerald-100">
            นำข้อมูลจาก localStorage / Backup JSON เข้า Supabase
          </p>
        </div>
      </section>

      <section className="mx-auto -mt-12 max-w-5xl px-4">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          {!isClientReady ? (
            <div className="rounded-3xl bg-slate-50 p-6 text-center font-black text-slate-500">
              กำลังอ่านข้อมูลจากเครื่องนี้...
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">ผู้ใช้น้ำ</p>
                  <p className="mt-2 text-3xl font-black">
                    {localSummary.users.toLocaleString("th-TH")}
                  </p>
                </div>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">จดมิเตอร์</p>
                  <p className="mt-2 text-3xl font-black">
                    {localSummary.readings.toLocaleString("th-TH")}
                  </p>
                </div>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">รับชำระ</p>
                  <p className="mt-2 text-3xl font-black">
                    {localSummary.payments.toLocaleString("th-TH")}
                  </p>
                </div>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-500">รอบบิลปัจจุบัน</p>
                  <p className="mt-2 text-lg font-black">
                    {localSummary.currentPeriod}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <h2 className="font-black text-amber-800">ก่อน Import</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-amber-700">
                  ให้กด Backup จากระบบเดิมเก็บไว้ก่อนเสมอ การ import นี้เป็นแบบ upsert:
                  ถ้า id เดิมมีอยู่จะอัปเดต ถ้ายังไม่มีจะเพิ่มใหม่ และไม่ลบข้อมูลเดิม
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 p-5">
                  <h2 className="text-xl font-black">นำเข้าจากเครื่องนี้</h2>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                    ใช้ข้อมูล localStorage ที่ระบบกำลังใช้อยู่ใน Browser นี้
                  </p>

                  <button
                    onClick={importFromLocalStorage}
                    disabled={isImporting}
                    className={
                      isImporting
                        ? "mt-5 w-full rounded-2xl bg-slate-300 px-5 py-4 font-black text-white"
                        : "mt-5 w-full rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white shadow"
                    }
                  >
                    {isImporting ? "กำลังนำเข้า..." : "Import localStorage เข้า Supabase"}
                  </button>
                </div>

                <div className="rounded-3xl border border-slate-200 p-5">
                  <h2 className="text-xl font-black">นำเข้าจากไฟล์ JSON</h2>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                    ใช้ไฟล์ Backup JSON ที่เคย Export ไว้
                  </p>

                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) =>
                      handleFileUpload(event.target.files?.[0] || null)
                    }
                    className="mt-5 block w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-slate-200 p-5">
                <h2 className="text-xl font-black">วาง JSON เอง</h2>

                <textarea
                  value={jsonText}
                  onChange={(event) => setJsonText(event.target.value)}
                  placeholder="วาง Backup JSON ที่นี่"
                  className="mt-4 min-h-[180px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm"
                />

                <button
                  onClick={importFromJsonText}
                  disabled={isImporting || !jsonText.trim()}
                  className={
                    isImporting || !jsonText.trim()
                      ? "mt-4 rounded-2xl bg-slate-300 px-5 py-4 font-black text-white"
                      : "mt-4 rounded-2xl bg-blue-600 px-5 py-4 font-black text-white shadow"
                  }
                >
                  Import JSON ที่วางไว้
                </button>
              </div>
            </>
          )}

          {result ? (
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
                {result.ok ? "Import สำเร็จ" : "Import ยังไม่ผ่าน"}
              </p>

              <p className="mt-2 font-bold text-slate-700">{result.message}</p>

              {result.summary ? (
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-bold text-slate-500">users</p>
                    <p className="text-2xl font-black">{result.summary.users}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-bold text-slate-500">readings</p>
                    <p className="text-2xl font-black">
                      {result.summary.readings}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-bold text-slate-500">payments</p>
                    <p className="text-2xl font-black">
                      {result.summary.payments}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-bold text-slate-500">periods</p>
                    <p className="text-2xl font-black">
                      {result.summary.periods}
                    </p>
                  </div>
                </div>
              ) : null}

              {result.error ? (
                <pre className="mt-4 overflow-auto rounded-2xl bg-white p-4 text-sm text-red-700">
                  {result.error}
                </pre>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/supabase-check"
              className="rounded-2xl bg-slate-900 px-5 py-4 font-black text-white"
            >
              ตรวจ Supabase อีกครั้ง
            </Link>

            <Link
              href="/"
              className="rounded-2xl bg-white px-5 py-4 font-black text-slate-700 ring-1 ring-slate-200"
            >
              กลับหน้าหลัก
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
