"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  exportAllData,
  importAllData,
  resetAllStoredData,
} from "../../lib/local-store";
import type { BackupData } from "../../types/water-system";

type RestoreStatus = "idle" | "ready" | "success" | "error";

function getFileDateText() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return `${year}${month}${day}-${hour}${minute}`;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], {
    type: `${mimeType};charset=utf-8`,
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function getCountText(value: number | undefined) {
  return Number(value || 0).toLocaleString("th-TH");
}

function isBackupLikeData(value: unknown): value is BackupData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as BackupData;

  return Boolean(data.settings && data.currentPeriod);
}

export default function BackupPage() {
  const [backupData, setBackupData] = useState<BackupData | null>(null);
  const [restoreData, setRestoreData] = useState<BackupData | null>(null);
  const [restoreFileName, setRestoreFileName] = useState("");
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function refreshBackupPreview() {
    const data = exportAllData();

    setBackupData(data);
  }

  useEffect(() => {
    refreshBackupPreview();
  }, []);

  const dataHealth = useMemo(() => {
    const usersCount = backupData?.users?.length || 0;
    const readingsCount = backupData?.readings?.length || 0;
    const paymentsCount = backupData?.payments?.length || 0;

    const userIds = new Set((backupData?.users || []).map((user) => user.id));

    const missingUserLinks = (backupData?.readings || []).filter(
      (reading) => !userIds.has(reading.waterUserId)
    );

    const currentPeriodId = backupData?.currentPeriod?.id || "";

    const currentPeriodReadings = (backupData?.readings || []).filter(
      (reading) => reading.periodId === currentPeriodId
    );

    const currentPeriodPayments = (backupData?.payments || []).filter(
      (payment) => payment.billId.includes(currentPeriodId)
    );

    const oldPeriodPayments = (backupData?.payments || []).filter(
      (payment) => !payment.billId.includes(currentPeriodId)
    );

    const isHealthy =
      usersCount > 0 &&
      missingUserLinks.length === 0 &&
      (paymentsCount === 0 || oldPeriodPayments.length < paymentsCount);

    return {
      usersCount,
      readingsCount,
      paymentsCount,
      missingUserLinksCount: missingUserLinks.length,
      currentPeriodReadingsCount: currentPeriodReadings.length,
      currentPeriodPaymentsCount: currentPeriodPayments.length,
      oldPeriodPaymentsCount: oldPeriodPayments.length,
      isHealthy,
    };
  }, [backupData]);

  function showMessage(text: string) {
    setMessage(text);
    setError("");
    window.setTimeout(() => setMessage(""), 3000);
  }

  function showError(text: string) {
    setError(text);
    setMessage("");
  }

  function handleDownloadJson() {
    const data = exportAllData();

    setBackupData(data);

    const fileName = `backup-water-billing-${getFileDateText()}.json`;

    downloadTextFile(
      fileName,
      JSON.stringify(data, null, 2),
      "application/json"
    );

    showMessage("ดาวน์โหลด Backup JSON แล้ว");
  }

  function handleDownloadTextSummary() {
    const data = exportAllData();

    setBackupData(data);

    const lines = [
      "สรุปข้อมูลระบบจัดเก็บค่าน้ำประปา",
      "----------------------------------------",
      `ชื่อระบบ: ${data.appName}`,
      `เวอร์ชัน Backup: ${data.version}`,
      `เวลาส่งออก: ${new Date(data.exportedAt).toLocaleString("th-TH")}`,
      "",
      `รอบบิลปัจจุบัน: ${data.currentPeriod.periodName}`,
      `รหัสรอบบิล: ${data.currentPeriod.id}`,
      `สถานะรอบบิล: ${data.currentPeriod.status || "-"}`,
      "",
      `หมู่บ้าน/ระบบ: ${data.settings.villageName}`,
      `ราคาต่อหน่วย: ${data.settings.unitPrice}`,
      `ค่าบริการกลาง: ${data.settings.serviceFee}`,
      `ค่าสูงสุดมิเตอร์: ${data.settings.meterMaxValue}`,
      "",
      `จำนวนผู้ใช้น้ำ: ${data.users.length}`,
      `จำนวนรายการจดมิเตอร์: ${data.readings.length}`,
      `จำนวนรายการรับชำระ: ${data.payments.length}`,
    ];

    const fileName = `backup-water-billing-summary-${getFileDateText()}.txt`;

    downloadTextFile(fileName, lines.join("\n"), "text/plain");

    showMessage("ดาวน์โหลดไฟล์สรุป TXT แล้ว");
  }

  async function handleRestoreFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setRestoreData(null);
    setRestoreFileName("");
    setRestoreConfirmText("");
    setRestoreStatus("idle");
    setError("");

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsedData = JSON.parse(text);

      if (!isBackupLikeData(parsedData)) {
        throw new Error("ไฟล์นี้ไม่ใช่ Backup ของระบบค่าน้ำประปา");
      }

      setRestoreData(parsedData);
      setRestoreFileName(file.name);
      setRestoreStatus("ready");
      showMessage("อ่านไฟล์ Backup สำเร็จ พร้อม Restore");
    } catch (restoreError) {
      setRestoreStatus("error");
      showError(
        restoreError instanceof Error
          ? restoreError.message
          : "อ่านไฟล์ Backup ไม่สำเร็จ"
      );
    } finally {
      event.target.value = "";
    }
  }

  function handleRestoreData() {
    if (!restoreData) {
      showError("กรุณาเลือกไฟล์ Backup ก่อน");
      return;
    }

    if (restoreConfirmText.trim() !== "RESTORE") {
      showError("กรุณาพิมพ์ RESTORE เพื่อยืนยันการกู้คืนข้อมูล");
      return;
    }

    try {
      const importedData = importAllData(restoreData);

      setBackupData(importedData);
      setRestoreStatus("success");
      setRestoreConfirmText("");
      showMessage("Restore สำเร็จ ข้อมูลถูกเชื่อมด้วย local-store แล้ว");
    } catch (restoreError) {
      setRestoreStatus("error");
      showError(
        restoreError instanceof Error
          ? restoreError.message
          : "Restore ไม่สำเร็จ"
      );
    }
  }

  function handleResetAllData() {
    if (deleteConfirmText.trim() !== "DELETE") {
      showError("กรุณาพิมพ์ DELETE เพื่อยืนยันการล้างข้อมูล");
      return;
    }

    resetAllStoredData();
    setDeleteConfirmText("");
    showMessage("ล้างข้อมูล localStorage แล้ว กำลังโหลดหน้าใหม่");

    window.setTimeout(() => {
      window.location.reload();
    }, 800);
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-24">
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-900 to-cyan-700 px-4 pb-24 pt-5 text-white">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-white/10" />

        <div className="relative mx-auto max-w-6xl">
          <Link href="/" className="text-sm font-bold text-blue-100">
            ← กลับหน้าหลัก
          </Link>

          <h1 className="mt-5 text-3xl font-black tracking-tight">
            Backup / Restore
          </h1>

          <p className="mt-1 text-sm text-blue-100">
            Data Link Fix · Export/Import ผ่าน local-store ศูนย์กลาง
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">ผู้ใช้น้ำ</p>
              <p className="mt-1 text-3xl font-black">
                {getCountText(dataHealth.usersCount)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">จดมิเตอร์</p>
              <p className="mt-1 text-3xl font-black">
                {getCountText(dataHealth.readingsCount)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">รับชำระ</p>
              <p className="mt-1 text-3xl font-black">
                {getCountText(dataHealth.paymentsCount)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">สถานะลิ้งข้อมูล</p>
              <p className="mt-1 text-xl font-black">
                {dataHealth.missingUserLinksCount === 0 ? "ปกติ" : "มีหลุดลิ้ง"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto -mt-16 max-w-6xl px-4">
        {message ? (
          <div className="mb-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center font-black text-emerald-700 shadow-sm">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-center font-black text-red-700 shadow-sm">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                ตรวจสุขภาพข้อมูล
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                เช็กว่า users / readings / payments ลิ้งกันครบไหม
              </p>
            </div>

            <button
              onClick={refreshBackupPreview}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow"
            >
              รีเฟรชข้อมูล
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div
              className={
                dataHealth.usersCount > 0
                  ? "rounded-3xl border border-emerald-200 bg-emerald-50 p-4"
                  : "rounded-3xl border border-red-200 bg-red-50 p-4"
              }
            >
              <p className="text-sm font-bold text-slate-600">
                users ต้องไม่ว่าง
              </p>

              <p className="mt-1 text-2xl font-black">
                {dataHealth.usersCount > 0 ? "ผ่าน" : "ยังว่าง"}
              </p>

              <p className="mt-1 text-sm text-slate-500">
                จำนวน {getCountText(dataHealth.usersCount)} ราย
              </p>
            </div>

            <div
              className={
                dataHealth.missingUserLinksCount === 0
                  ? "rounded-3xl border border-emerald-200 bg-emerald-50 p-4"
                  : "rounded-3xl border border-red-200 bg-red-50 p-4"
              }
            >
              <p className="text-sm font-bold text-slate-600">
                readings ต้องหา user เจอ
              </p>

              <p className="mt-1 text-2xl font-black">
                {dataHealth.missingUserLinksCount === 0 ? "ผ่าน" : "หลุดลิ้ง"}
              </p>

              <p className="mt-1 text-sm text-slate-500">
                หลุด {getCountText(dataHealth.missingUserLinksCount)} รายการ
              </p>
            </div>

            <div
              className={
                dataHealth.oldPeriodPaymentsCount === 0
                  ? "rounded-3xl border border-emerald-200 bg-emerald-50 p-4"
                  : "rounded-3xl border border-orange-200 bg-orange-50 p-4"
              }
            >
              <p className="text-sm font-bold text-slate-600">
                payments คนละรอบ
              </p>

              <p className="mt-1 text-2xl font-black">
                {getCountText(dataHealth.oldPeriodPaymentsCount)}
              </p>

              <p className="mt-1 text-sm text-slate-500">
                รอบปัจจุบัน {getCountText(dataHealth.currentPeriodPaymentsCount)} รายการ
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              รอบบิลปัจจุบัน:{" "}
              <b>{backupData?.currentPeriod?.periodName || "-"}</b>
            </p>

            <p className="mt-1">
              รหัสรอบบิล: <b>{backupData?.currentPeriod?.id || "-"}</b>
            </p>

            <p className="mt-1">
              หมู่บ้าน/ระบบ: <b>{backupData?.settings?.villageName || "-"}</b>
            </p>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black text-slate-900">
              ดาวน์โหลด Backup
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              ส่งออกข้อมูลจาก local-store โดยตรง ป้องกัน users ว่าง
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                onClick={handleDownloadJson}
                className="rounded-3xl bg-blue-600 px-5 py-5 text-lg font-black text-white shadow"
              >
                ดาวน์โหลด JSON
              </button>

              <button
                onClick={handleDownloadTextSummary}
                className="rounded-3xl bg-slate-900 px-5 py-5 text-lg font-black text-white shadow"
              >
                ดาวน์โหลด TXT สรุป
              </button>
            </div>

            <div className="mt-5 rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
              <b>คำแนะนำ:</b> หลังแก้ Data Link Fix แล้ว ให้กดดาวน์โหลด JSON ใหม่
              แล้วเปิดไฟล์ดู ต้องเห็น <code>"users": [</code> ไม่ใช่{" "}
              <code>"users": []</code>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black text-slate-900">
              Restore Backup
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              เลือกไฟล์ JSON เพื่อกู้คืนข้อมูลเข้าระบบ
            </p>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center hover:bg-slate-100">
              <span className="text-4xl">📦</span>
              <span className="mt-2 font-black text-slate-900">
                เลือกไฟล์ Backup JSON
              </span>
              <span className="mt-1 text-sm text-slate-500">
                รองรับไฟล์ .json เท่านั้น
              </span>

              <input
                type="file"
                accept="application/json,.json"
                onChange={handleRestoreFile}
                className="hidden"
              />
            </label>

            {restoreData ? (
              <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p>
                  ไฟล์: <b>{restoreFileName}</b>
                </p>

                <p className="mt-1">
                  ผู้ใช้น้ำ: <b>{getCountText(restoreData.users?.length)}</b>{" "}
                  ราย · จดมิเตอร์:{" "}
                  <b>{getCountText(restoreData.readings?.length)}</b> รายการ ·
                  รับชำระ: <b>{getCountText(restoreData.payments?.length)}</b>{" "}
                  รายการ
                </p>

                <p className="mt-1">
                  รอบบิล: <b>{restoreData.currentPeriod?.periodName || "-"}</b>
                </p>
              </div>
            ) : null}

            <div className="mt-4">
              <label className="text-sm font-black text-slate-700">
                พิมพ์ RESTORE เพื่อยืนยัน
              </label>

              <input
                value={restoreConfirmText}
                onChange={(event) => setRestoreConfirmText(event.target.value)}
                placeholder="RESTORE"
                className="mt-2 w-full rounded-2xl border border-slate-200 px-5 py-4 font-black outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleRestoreData}
              disabled={restoreStatus !== "ready" && restoreStatus !== "success"}
              className={
                restoreStatus === "ready" || restoreStatus === "success"
                  ? "mt-4 w-full rounded-3xl bg-emerald-600 px-5 py-5 text-lg font-black text-white shadow"
                  : "mt-4 w-full rounded-3xl bg-slate-300 px-5 py-5 text-lg font-black text-white"
              }
            >
              Restore ข้อมูล
            </button>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <h2 className="text-xl font-black text-red-900">
            ล้างข้อมูลในเครื่องนี้
          </h2>

          <p className="mt-1 text-sm text-red-700">
            ใช้เฉพาะตอนต้องการเริ่มทดสอบใหม่ ข้อมูลใน browser นี้จะถูกลบทั้งหมด
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder="พิมพ์ DELETE เพื่อยืนยัน"
              className="rounded-2xl border border-red-200 bg-white px-5 py-4 font-black outline-none focus:border-red-500"
            />

            <button
              onClick={handleResetAllData}
              className="rounded-2xl bg-red-600 px-5 py-4 font-black text-white shadow"
            >
              ล้างข้อมูลทั้งหมด
            </button>
          </div>
        </section>
      </section>

      <nav className="fixed bottom-3 left-3 right-3 z-20 rounded-3xl border border-slate-200 bg-white/95 px-2 py-2 shadow-xl backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-4 gap-1 text-center text-xs">
          <Link
            href="/"
            className="rounded-2xl px-2 py-2 font-bold text-slate-500"
          >
            <div className="text-lg">🏠</div>
            หน้าหลัก
          </Link>

          <Link
            href="/meter-reading"
            className="rounded-2xl px-2 py-2 font-bold text-slate-500"
          >
            <div className="text-lg">💧</div>
            จดน้ำ
          </Link>

          <Link
            href="/reports"
            className="rounded-2xl px-2 py-2 font-bold text-slate-500"
          >
            <div className="text-lg">📊</div>
            รายงาน
          </Link>

          <Link
            href="/backup"
            className="rounded-2xl bg-blue-50 px-2 py-2 font-black text-blue-700"
          >
            <div className="text-lg">💾</div>
            Backup
          </Link>
        </div>
      </nav>
    </main>
  );
}
