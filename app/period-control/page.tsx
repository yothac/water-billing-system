"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  calculateWaterBillV4,
  formatThaiCurrency,
  formatThaiNumber,
} from "../../lib/billing";
import { getUserServiceFee } from "../../lib/service-fee";
import {
  buildBillingPeriod,
  exportAllData,
  saveStoredCurrentPeriod,
} from "../../lib/local-store";
import { loadWaterAppData } from "../../lib/app-data-client";
import { getDataSourceMode, type DataSourceMode } from "../../lib/data-source";
import type {
  BillingMode,
  BillingPeriod,
  BillingPeriodStatus,
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../../types/water-system";

type ActionMode = "close" | "lock" | "open" | "next" | "";

function makeBillId(periodId: string, waterUserId: string) {
  return `bill-${periodId}-${waterUserId}`;
}

function getDefaultBillingMode(user: WaterUser | undefined): BillingMode {
  if (!user) {
    return "normal";
  }

  if (user.cutMeter || user.status === "cut" || user.userStatus === "CUT") {
    return "disconnected_no_charge";
  }

  if (
    user.serviceOnly ||
    user.userStatus === "SERVICE_ONLY" ||
    user.defaultBillingMode === "service_only"
  ) {
    return "service_only";
  }

  if (user.defaultBillingMode) {
    return user.defaultBillingMode;
  }

  return "normal";
}

function isActiveUser(user: WaterUser) {
  return user.status !== "inactive";
}

function getNextMonthPeriod(period: BillingPeriod) {
  const currentMonth = Number(period.month || Number(period.id.slice(-2)) || 1);
  const currentYear =
    Number(period.year || period.id.match(/period-(\d{4})-/)?.[1]) ||
    new Date().getFullYear() + 543;

  const nextMonth = currentMonth >= 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth >= 12 ? currentYear + 1 : currentYear;

  return buildBillingPeriod(nextMonth, nextYear);
}

function getStatusText(status?: BillingPeriodStatus) {
  if (status === "locked") {
    return "ล็อกรอบแล้ว";
  }

  if (status === "closed") {
    return "ปิดรอบแล้ว";
  }

  return "เปิดใช้งาน";
}

function getStatusClass(status?: BillingPeriodStatus) {
  if (status === "locked") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "closed") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function downloadBackupJson() {
  const data = exportAllData();
  const fileName = `period-control-backup-${Date.now()}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

export default function PeriodControlPage() {
  const [settings, setSettings] = useState<WaterSettings>({
    villageName: "ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน",
    unitPrice: 8,
    serviceFee: 20,
    meterMaxValue: 9999,
  });

  const [currentPeriod, setCurrentPeriod] = useState<BillingPeriod>({
    id: "period-2569-06",
    periodName: "มิถุนายน 2569",
    month: 6,
    year: 2569,
    status: "open",
  });

  const [users, setUsers] = useState<WaterUser[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [actionMode, setActionMode] = useState<ActionMode>("");
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dataSourceMode, setDataSourceMode] =
    useState<DataSourceMode>("localStorage");

  async function refreshData() {
    const mode = getDataSourceMode();

    setDataSourceMode(mode);

    try {
      const data = await loadWaterAppData();

      setSettings(data.settings);
      setCurrentPeriod(data.currentPeriod);
      setUsers(data.users);
      setReadings(data.readings);
      setPayments(data.payments);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "โหลดข้อมูลรอบบิลไม่สำเร็จ"
      );
    }
  }

  useEffect(() => {
    void refreshData();
  }, []);

  const summary = useMemo(() => {
    const activeUsers = users.filter(isActiveUser);
    const periodReadings = readings.filter(
      (reading) => reading.periodId === currentPeriod.id
    );

    const paidBillIds = new Set(
      payments
        .filter((payment) => payment.status !== "cancelled")
        .map((payment) => payment.billId)
    );

    const billRows = periodReadings.map((reading) => {
      const user = users.find((item) => item.id === reading.waterUserId);
      const serviceFee =
        reading.serviceFee !== undefined
          ? Number(reading.serviceFee || 0)
          : getUserServiceFee(user, settings);

      const calculation = calculateWaterBillV4({
        previousReading: reading.previousReading,
        currentReading: reading.currentReading,
        unitPrice: reading.unitPrice ?? settings.unitPrice,
        serviceFee,
        meterMaxValue: reading.meterMaxValue ?? settings.meterMaxValue,
        billingMode: reading.billingMode || getDefaultBillingMode(user),
        oldMeterFinalReading: reading.oldMeterFinalReading,
      });

      const billId = makeBillId(reading.periodId, reading.waterUserId);

      return {
        billId,
        totalAmount: calculation.totalAmount,
        isPaid: paidBillIds.has(billId),
      };
    });

    const totalAmount = billRows.reduce((sum, row) => sum + row.totalAmount, 0);
    const paidAmount = billRows.reduce(
      (sum, row) => sum + (row.isPaid ? row.totalAmount : 0),
      0
    );

    const completedCount = periodReadings.length;
    const totalCount = activeUsers.length;
    const remainingCount = Math.max(totalCount - completedCount, 0);
    const paidCount = billRows.filter((row) => row.isPaid).length;
    const unpaidCount = Math.max(completedCount - paidCount, 0);
    const unpaidAmount = totalAmount - paidAmount;
    const progressPercent =
      totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

    return {
      activeUsers,
      periodReadings,
      totalCount,
      completedCount,
      remainingCount,
      paidCount,
      unpaidCount,
      totalAmount,
      paidAmount,
      unpaidAmount,
      progressPercent,
      isAllRead: remainingCount === 0 && totalCount > 0,
      hasUnpaid: unpaidCount > 0,
    };
  }, [users, readings, payments, settings, currentPeriod.id]);

  const nextPeriod = useMemo(
    () => getNextMonthPeriod(currentPeriod),
    [currentPeriod]
  );

  function showMessage(text: string) {
    setMessage(text);
    setError("");
    window.setTimeout(() => setMessage(""), 3000);
  }

  function showError(text: string) {
    setError(text);
    setMessage("");
  }

  function resetAction() {
    setActionMode("");
    setConfirmText("");
  }

  async function savePeriodToSupabase(period: BillingPeriod) {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        settings,
        currentPeriod: period,
      }),
    });

    const data = (await response.json()) as {
      ok: boolean;
      message?: string;
      error?: string;
    };

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error || data.message || "บันทึกรอบบิลเข้า Supabase ไม่สำเร็จ"
      );
    }
  }

  async function updatePeriod(nextStatus: BillingPeriodStatus, extra?: Partial<BillingPeriod>) {
    const now = new Date().toISOString();

    const nextPeriodData: BillingPeriod = {
      ...currentPeriod,
      status: nextStatus,
      updatedAt: now,
      ...extra,
    };

    if (nextStatus === "open") {
      nextPeriodData.closedAt = null;
      nextPeriodData.lockedAt = null;
    }

    if (nextStatus === "closed") {
      nextPeriodData.closedAt = currentPeriod.closedAt || now;
      nextPeriodData.lockedAt = null;
    }

    if (nextStatus === "locked") {
      nextPeriodData.closedAt = currentPeriod.closedAt || now;
      nextPeriodData.lockedAt = now;
    }

    if (dataSourceMode === "supabase") {
      await savePeriodToSupabase(nextPeriodData);
    } else {
      saveStoredCurrentPeriod(nextPeriodData);
    }

    setCurrentPeriod(nextPeriodData);
  }

  async function handleRunAction() {
    try {
    if (actionMode === "close") {
      if (confirmText !== "CLOSE") {
        showError("กรุณาพิมพ์ CLOSE เพื่อยืนยันการปิดรอบ");
        return;
      }

      downloadBackupJson();
      await updatePeriod("closed");
      resetAction();
      showMessage("ปิดรอบบิลแล้ว และดาวน์โหลด Backup ก่อนเปลี่ยนสถานะแล้ว");
      return;
    }

    if (actionMode === "lock") {
      if (confirmText !== "LOCK") {
        showError("กรุณาพิมพ์ LOCK เพื่อยืนยันการล็อกรอบ");
        return;
      }

      downloadBackupJson();
      await updatePeriod("locked");
      resetAction();
      showMessage("ล็อกรอบบิลแล้ว และดาวน์โหลด Backup ก่อนล็อกแล้ว");
      return;
    }

    if (actionMode === "open") {
      if (confirmText !== "OPEN") {
        showError("กรุณาพิมพ์ OPEN เพื่อเปิดรอบแก้ไข");
        return;
      }

      downloadBackupJson();
      await updatePeriod("open");
      resetAction();
      showMessage("เปิดรอบเพื่อแก้ไขแล้ว");
      return;
    }

    if (actionMode === "next") {
      if (confirmText !== "NEXT") {
        showError("กรุณาพิมพ์ NEXT เพื่อย้ายไปรอบบิลถัดไป");
        return;
      }

      downloadBackupJson();

      const next: BillingPeriod = {
        ...nextPeriod,
        status: "open",
        closedAt: null,
        lockedAt: null,
        updatedAt: new Date().toISOString(),
      };

      if (dataSourceMode === "supabase") {
        await savePeriodToSupabase(next);
      } else {
        saveStoredCurrentPeriod(next);
      }

      setCurrentPeriod(next);
      resetAction();
      showMessage(`ย้ายไปรอบบิล ${next.periodName} แล้ว`);
      return;
    }

    showError("กรุณาเลือกคำสั่งก่อน");
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "บันทึกรอบบิลไม่สำเร็จ"
      );
    }
  }

  const actionTitle =
    actionMode === "close"
      ? "ยืนยันปิดรอบบิล"
      : actionMode === "lock"
        ? "ยืนยันล็อกรอบบิล"
        : actionMode === "open"
          ? "ยืนยันเปิดรอบเพื่อแก้ไข"
          : actionMode === "next"
            ? "ยืนยันย้ายไปรอบบิลถัดไป"
            : "ยังไม่ได้เลือกคำสั่ง";

  const requiredText =
    actionMode === "close"
      ? "CLOSE"
      : actionMode === "lock"
        ? "LOCK"
        : actionMode === "open"
          ? "OPEN"
          : actionMode === "next"
            ? "NEXT"
            : "";

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-900 to-cyan-700 px-4 pb-24 pt-5 text-white">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-white/10" />

        <div className="relative mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/" className="text-sm font-bold text-blue-100">
                ← กลับหน้าหลัก
              </Link>

              <h1 className="mt-5 text-3xl font-black tracking-tight">
                ควบคุมรอบบิล
              </h1>

              <p className="mt-1 text-sm text-blue-100">
                ปิดรอบ · ล็อกรอบ · เปิดแก้ไข · ย้ายรอบถัดไป
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={refreshData}
                className="rounded-2xl border border-white/30 bg-white/15 px-4 py-3 text-sm font-black text-white shadow-sm backdrop-blur"
              >
                รีเฟรช
              </button>

              <button
                onClick={downloadBackupJson}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-700 shadow-sm"
              >
                Backup ตอนนี้
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">รอบบิลปัจจุบัน</p>
              <p className="mt-1 text-2xl font-black">{currentPeriod.periodName}</p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">จดแล้ว</p>
              <p className="mt-1 text-2xl font-black">
                {formatThaiNumber(summary.completedCount)} /{" "}
                {formatThaiNumber(summary.totalCount)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">ค้างชำระ</p>
              <p className="mt-1 text-2xl font-black">
                {formatThaiCurrency(summary.unpaidAmount)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">สถานะ</p>
              <p className="mt-1 text-2xl font-black">
                {getStatusText(currentPeriod.status)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto -mt-16 max-w-7xl px-4">
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

        <section className="grid gap-5 lg:grid-cols-[1fr_420px]">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  สถานะรอบบิล
                </h2>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {settings.villageName}
                </p>
              </div>

              <span
                className={`rounded-full border px-4 py-2 text-sm font-black ${getStatusClass(
                  currentPeriod.status
                )}`}
              >
                {getStatusText(currentPeriod.status)}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-3xl bg-blue-50 p-4">
                <p className="text-sm font-bold text-blue-700">ความคืบหน้า</p>
                <p className="mt-1 text-2xl font-black text-blue-900">
                  {summary.progressPercent}%
                </p>
              </div>

              <div className="rounded-3xl bg-orange-50 p-4">
                <p className="text-sm font-bold text-orange-700">ค้างจด</p>
                <p className="mt-1 text-2xl font-black text-orange-900">
                  {formatThaiNumber(summary.remainingCount)}
                </p>
              </div>

              <div className="rounded-3xl bg-emerald-50 p-4">
                <p className="text-sm font-bold text-emerald-700">ชำระแล้ว</p>
                <p className="mt-1 text-2xl font-black text-emerald-900">
                  {formatThaiNumber(summary.paidCount)} ราย
                </p>
              </div>

              <div className="rounded-3xl bg-red-50 p-4">
                <p className="text-sm font-bold text-red-700">ค้างชำระ</p>
                <p className="mt-1 text-2xl font-black text-red-900">
                  {formatThaiNumber(summary.unpaidCount)} ราย
                </p>
              </div>
            </div>

            <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-4 rounded-full bg-blue-600"
                style={{ width: `${summary.progressPercent}%` }}
              />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                onClick={() => {
                  setActionMode("close");
                  setConfirmText("");
                }}
                className="rounded-3xl border border-orange-200 bg-orange-50 p-5 text-left text-orange-800"
              >
                <p className="text-xl font-black">ปิดรอบบิล</p>
                <p className="mt-1 text-sm font-bold">
                  ใช้เมื่อจดน้ำ/ตรวจยอดเสร็จแล้ว แต่ยังต้องเปิดแก้ไขได้
                </p>
              </button>

              <button
                onClick={() => {
                  setActionMode("lock");
                  setConfirmText("");
                }}
                className="rounded-3xl border border-red-200 bg-red-50 p-5 text-left text-red-800"
              >
                <p className="text-xl font-black">ล็อกรอบบิล</p>
                <p className="mt-1 text-sm font-bold">
                  ใช้เมื่อไม่ต้องการแก้ไขรอบนี้แล้ว
                </p>
              </button>

              <button
                onClick={() => {
                  setActionMode("open");
                  setConfirmText("");
                }}
                className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-left text-emerald-800"
              >
                <p className="text-xl font-black">เปิดรอบเพื่อแก้ไข</p>
                <p className="mt-1 text-sm font-bold">
                  เปิดกลับมาแก้ไขกรณียอดผิดหรือกรอกผิด
                </p>
              </button>

              <button
                onClick={() => {
                  setActionMode("next");
                  setConfirmText("");
                }}
                className="rounded-3xl border border-blue-200 bg-blue-50 p-5 text-left text-blue-800"
              >
                <p className="text-xl font-black">ย้ายไปรอบถัดไป</p>
                <p className="mt-1 text-sm font-bold">
                  เปิดรอบใหม่: {nextPeriod.periodName}
                </p>
              </button>
            </div>

            <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-lg font-black text-slate-900">
                คำเตือนก่อนเปลี่ยนสถานะ
              </h3>

              <div className="mt-3 space-y-2 text-sm font-bold text-slate-600">
                {!summary.isAllRead ? (
                  <p className="text-orange-700">
                    • ยังมีผู้ใช้น้ำค้างจด {formatThaiNumber(summary.remainingCount)} ราย
                  </p>
                ) : (
                  <p className="text-emerald-700">• จดมิเตอร์ครบทุกคนแล้ว</p>
                )}

                {summary.hasUnpaid ? (
                  <p className="text-red-700">
                    • ยังมีค้างชำระ {formatThaiNumber(summary.unpaidCount)} ราย
                    รวม {formatThaiCurrency(summary.unpaidAmount)}
                  </p>
                ) : (
                  <p className="text-emerald-700">• ไม่มีรายการค้างชำระในรอบนี้</p>
                )}

                <p>• ทุกคำสั่งจะดาวน์โหลด Backup JSON ก่อนเปลี่ยนสถานะ</p>
                <p>• การย้ายรอบใหม่จะไม่ลบ readings/payments เก่า เพราะข้อมูลแยกด้วย periodId</p>
              </div>
            </div>
          </div>

          <aside className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black text-slate-900">
              {actionTitle}
            </h2>

            {actionMode ? (
              <>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                  เพื่อป้องกันกดผิด ให้พิมพ์คำว่า{" "}
                  <span className="font-black text-slate-900">{requiredText}</span>{" "}
                  ก่อนยืนยัน
                </p>

                <input
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder={`พิมพ์ ${requiredText}`}
                  className="mt-4 w-full rounded-2xl border border-slate-200 px-5 py-4 text-xl font-black outline-none focus:border-blue-500"
                />

                <button
                  onClick={handleRunAction}
                  className="mt-4 w-full rounded-3xl bg-slate-900 px-5 py-5 text-lg font-black text-white shadow"
                >
                  ยืนยันคำสั่ง
                </button>

                <button
                  onClick={resetAction}
                  className="mt-3 w-full rounded-3xl bg-slate-100 px-5 py-4 font-black text-slate-700"
                >
                  ยกเลิก
                </button>
              </>
            ) : (
              <div className="mt-4 rounded-3xl bg-slate-50 p-6 text-center text-slate-500">
                เลือกคำสั่งจากฝั่งซ้ายก่อน
              </div>
            )}

            <div className="mt-5 grid gap-3">
              <Link
                href="/settings"
                className="rounded-2xl bg-blue-50 px-4 py-3 text-center font-black text-blue-700"
              >
                ตั้งค่ารอบบิล
              </Link>

              <Link
                href="/backup"
                className="rounded-2xl bg-emerald-50 px-4 py-3 text-center font-black text-emerald-700"
              >
                Backup / Restore
              </Link>

              <Link
                href="/data-doctor"
                className="rounded-2xl bg-purple-50 px-4 py-3 text-center font-black text-purple-700"
              >
                Data Doctor
              </Link>
            </div>
          </aside>
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
            href="/payments"
            className="rounded-2xl px-2 py-2 font-bold text-slate-500"
          >
            <div className="text-lg">💵</div>
            จ่ายเงิน
          </Link>

          <Link
            href="/reports"
            className="rounded-2xl px-2 py-2 font-bold text-slate-500"
          >
            <div className="text-lg">📊</div>
            รายงาน
          </Link>
        </div>
      </nav>
    </main>
  );
}
