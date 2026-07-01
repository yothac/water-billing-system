"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  calculateWaterBillV4,
  formatThaiCurrency,
  formatThaiNumber,
  getBillingModeLabel,
} from "../../lib/billing";
import { getUserServiceFee } from "../../lib/service-fee";
import {
  getStoredMeterReadings,
  getStoredPayments,
  getStoredSettings,
  getStoredWaterUsers,
  saveStoredMeterReadings,
  saveStoredPayments,
} from "../../lib/local-store";
import type {
  BillingMode,
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../../types/water-system";

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

export default function AdminToolsPage() {
  const [users, setUsers] = useState<WaterUser[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settings, setSettings] = useState<WaterSettings>({
    villageName: "ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน",
    serviceFee: 20,
    unitPrice: 8,
    meterMaxValue: 9999,
  });
  const [message, setMessage] = useState("");

  function refreshData() {
    setUsers(getStoredWaterUsers());
    setReadings(getStoredMeterReadings());
    setPayments(getStoredPayments());
    setSettings(getStoredSettings());
  }

  useEffect(() => {
    refreshData();
  }, []);

  const issues = useMemo(() => {
    const nextIssues: string[] = [];
    const userIds = new Set(users.map((user) => user.id));
    const billIds = new Set(
      readings.map((reading) =>
        makeBillId(reading.periodId, reading.waterUserId)
      )
    );

    readings.forEach((reading) => {
      const user = users.find((item) => item.id === reading.waterUserId);

      if (!user) {
        nextIssues.push(
          `รายการจดน้ำ ${reading.waterUserId} ไม่มีข้อมูลผู้ใช้น้ำ`
        );
        return;
      }

      const billingMode = reading.billingMode || getDefaultBillingMode(user);
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
        billingMode,
        oldMeterFinalReading: reading.oldMeterFinalReading,
      });

      if (user.serviceOnly && reading.usedUnits !== 0) {
        nextIssues.push(`${user.fullName} เป็นเฉพาะค่าบริการแต่มีหน่วยน้ำ`);
      }

      if (reading.usedUnits !== calculation.usedUnits) {
        nextIssues.push(`${user.fullName} หน่วยน้ำไม่ตรง Billing Core V4`);
      }

      if (Math.abs(Number(reading.totalAmount || 0) - calculation.totalAmount) >= 0.01) {
        nextIssues.push(`${user.fullName} ยอดรวมไม่ตรง Billing Core V4`);
      }
    });

    payments.forEach((payment) => {
      if (!billIds.has(payment.billId)) {
        nextIssues.push(`รายการรับชำระไม่มีบิล: ${payment.billId}`);
      }

      if (!payment.periodId || !payment.waterUserId) {
        nextIssues.push(`รายการรับชำระขาด periodId/waterUserId: ${payment.billId}`);
      }
    });

    if (users.length === 0) {
      nextIssues.push("ไม่มีข้อมูลผู้ใช้น้ำ");
    }

    return nextIssues;
  }, [users, readings, payments, settings]);

  const summary = useMemo(() => {
    const totalAmount = readings.reduce((sum, reading) => {
      const user = users.find((item) => item.id === reading.waterUserId);
      const billingMode = reading.billingMode || getDefaultBillingMode(user);
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
        billingMode,
        oldMeterFinalReading: reading.oldMeterFinalReading,
      });

      return sum + calculation.totalAmount;
    }, 0);

    return {
      users: users.length,
      readings: readings.length,
      payments: payments.length,
      totalAmount,
    };
  }, [users, readings, payments, settings]);

  function repairSafe() {
    const userIds = new Set(users.map((user) => user.id));

    const nextReadings: MeterReading[] = readings
      .filter((reading) => userIds.has(reading.waterUserId))
      .map((reading) => {
        const user = users.find((item) => item.id === reading.waterUserId);
        const billingMode = reading.billingMode || getDefaultBillingMode(user);
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
          billingMode,
          oldMeterFinalReading: reading.oldMeterFinalReading,
        });

        return {
          ...reading,
          previousReading: calculation.previousReading,
          currentReading: calculation.currentReading,
          usedUnits: calculation.usedUnits,
          unitPrice: calculation.unitPrice,
          waterAmount: calculation.waterAmount,
          serviceFee: calculation.serviceFee,
          totalAmount: calculation.totalAmount,
          billingMode: calculation.billingMode,
          meterStatus: calculation.meterStatus,
          oldMeterFinalReading: calculation.oldMeterFinalReading,
          oldMeterUnits: calculation.oldMeterUnits,
          newMeterUnits: calculation.newMeterUnits,
          isRollover: calculation.isRollover,
          isBackward: calculation.isBackward,
          updatedAt: new Date().toISOString(),
        };
      });

    const nextBillIds = new Set(
      nextReadings.map((reading) =>
        makeBillId(reading.periodId, reading.waterUserId)
      )
    );

    const nextPayments = payments.filter((payment) =>
      nextBillIds.has(payment.billId)
    );

    saveStoredMeterReadings(nextReadings);
    saveStoredPayments(nextPayments);

    setReadings(nextReadings);
    setPayments(nextPayments);
    setMessage("ซ่อมข้อมูล Admin Tools แล้ว");

    window.setTimeout(() => setMessage(""), 2500);
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-24">
      <section className="bg-gradient-to-br from-slate-950 via-blue-900 to-cyan-700 px-4 pb-20 pt-5 text-white">
        <div className="mx-auto max-w-6xl">
          <Link href="/" className="text-sm font-bold text-blue-100">
            ← กลับหน้าหลัก
          </Link>

          <h1 className="mt-5 text-3xl font-black">Admin Tools</h1>

          <p className="mt-1 text-sm text-blue-100">
            เครื่องมือตรวจและซ่อมข้อมูลแบบปลอดภัย
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl bg-white/15 p-5">
              <p className="text-sm text-blue-100">ผู้ใช้น้ำ</p>
              <p className="text-3xl font-black">{formatThaiNumber(summary.users)}</p>
            </div>
            <div className="rounded-3xl bg-white/15 p-5">
              <p className="text-sm text-blue-100">จดน้ำ</p>
              <p className="text-3xl font-black">{formatThaiNumber(summary.readings)}</p>
            </div>
            <div className="rounded-3xl bg-white/15 p-5">
              <p className="text-sm text-blue-100">ชำระ</p>
              <p className="text-3xl font-black">{formatThaiNumber(summary.payments)}</p>
            </div>
            <div className="rounded-3xl bg-white/15 p-5">
              <p className="text-sm text-blue-100">ยอดรวม</p>
              <p className="text-3xl font-black">{formatThaiCurrency(summary.totalAmount)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-12 max-w-6xl px-4">
        {message ? (
          <div className="mb-4 rounded-3xl bg-emerald-50 p-4 text-center font-black text-emerald-700">
            {message}
          </div>
        ) : null}

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                ผลตรวจข้อมูล
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                พบ {formatThaiNumber(issues.length)} จุด
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={refreshData}
                className="rounded-2xl bg-slate-900 px-5 py-3 font-black text-white"
              >
                รีเฟรช
              </button>
              <button
                onClick={repairSafe}
                className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white"
              >
                ซ่อมอัตโนมัติ
              </button>
              <Link
                href="/data-doctor"
                className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white"
              >
                เปิด Data Doctor
              </Link>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {issues.length === 0 ? (
              <div className="rounded-3xl bg-emerald-50 p-5 font-black text-emerald-700">
                ไม่พบข้อมูลผิดปกติ
              </div>
            ) : (
              issues.map((issue, index) => (
                <div
                  key={`${issue}-${index}`}
                  className="rounded-3xl bg-orange-50 p-4 font-bold text-orange-700"
                >
                  {issue}
                </div>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
