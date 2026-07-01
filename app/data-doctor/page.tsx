"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  calculateWaterBillV4,
  formatThaiCurrency,
  formatThaiNumber,
  getBillingModeLabel,
  getMeterStatusLabel,
} from "../../lib/billing";
import { getUserServiceFee } from "../../lib/service-fee";
import {
  exportAllData,
  getStoredCurrentPeriod,
  getStoredMeterReadings,
  getStoredPayments,
  getStoredSettings,
  getStoredWaterUsers,
  saveStoredMeterReadings,
  saveStoredPayments,
  saveStoredWaterUsers,
} from "../../lib/local-store";
import type {
  BillingMode,
  BillingPeriod,
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../../types/water-system";

interface DoctorIssue {
  id: string;
  level: "ok" | "warning" | "error";
  title: string;
  detail: string;
  count: number;
}

interface ParsedBillId {
  periodId: string;
  waterUserId: string;
}

function makeBillId(periodId: string, waterUserId: string) {
  return `bill-${periodId}-${waterUserId}`;
}

function parseBillId(billId: string): ParsedBillId | null {
  const match = billId.match(/bill-(period-\d{4}-\d{2})-(.+)$/);

  if (!match) {
    return null;
  }

  return {
    periodId: match[1],
    waterUserId: match[2],
  };
}

function getNowIso() {
  return new Date().toISOString();
}

function getTimeValue(value?: string | null) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : 0;
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

function makePlaceholderUserFromReading(reading: MeterReading, index: number): WaterUser {
  const now = getNowIso();
  const shortCode = reading.waterUserId.replace(/^user-/, "");

  return {
    id: reading.waterUserId,
    userCode: shortCode || `AUTO-${index + 1}`,
    legacyUserId: null,
    fullName: `ไม่พบข้อมูลผู้ใช้น้ำ (${shortCode || reading.waterUserId})`,
    address: "",
    addressCode: null,
    villageNo: "",
    phone: "",
    status:
      reading.billingMode === "disconnected_no_charge" ? "cut" : "active",
    userStatus:
      reading.billingMode === "disconnected_no_charge"
        ? "CUT"
        : reading.billingMode === "service_only"
          ? "SERVICE_ONLY"
          : undefined,
    defaultBillingMode: reading.billingMode || "normal",
    serviceOnly: reading.billingMode === "service_only",
    cutMeter: reading.billingMode === "disconnected_no_charge",
    serviceFeeOverride:
      reading.serviceFee !== undefined && reading.serviceFee !== null
        ? Number(reading.serviceFee)
        : null,
    lastReading: Number(reading.currentReading || 0),
    lastReadingText: String(Number(reading.currentReading || 0)).padStart(
      4,
      "0"
    ),
    lastRecordDateLabel: reading.periodId,
    note: "Data Doctor สร้างชั่วคราวจากรายการจดมิเตอร์ เพราะไม่พบข้อมูลผู้ใช้น้ำ",
    createdAt: now,
    updatedAt: now,
  };
}

function deduplicateReadings(readings: MeterReading[]) {
  const byKey = new Map<string, MeterReading>();

  readings.forEach((reading) => {
    const key = `${reading.periodId}:${reading.waterUserId}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, reading);
      return;
    }

    const existingTime = Math.max(
      getTimeValue(existing.updatedAt),
      getTimeValue(existing.recordedAt),
      getTimeValue(existing.createdAt)
    );

    const nextTime = Math.max(
      getTimeValue(reading.updatedAt),
      getTimeValue(reading.recordedAt),
      getTimeValue(reading.createdAt)
    );

    if (nextTime >= existingTime) {
      byKey.set(key, reading);
    }
  });

  return Array.from(byKey.values());
}

function getDuplicateCount(readings: MeterReading[]) {
  const counts = new Map<string, number>();

  readings.forEach((reading) => {
    const key = `${reading.periodId}:${reading.waterUserId}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function getReadingCalculation(
  reading: MeterReading,
  user: WaterUser | undefined,
  settings: WaterSettings
) {
  const billingMode = reading.billingMode || getDefaultBillingMode(user);

  const serviceFee =
    reading.serviceFee !== undefined
      ? Number(reading.serviceFee || 0)
      : getUserServiceFee(user, settings);

  return calculateWaterBillV4({
    previousReading: Number(reading.previousReading || 0),
    currentReading: Number(reading.currentReading || 0),
    unitPrice: Number(reading.unitPrice ?? settings.unitPrice),
    serviceFee,
    meterMaxValue: Number(reading.meterMaxValue ?? settings.meterMaxValue),
    billingMode,
    oldMeterFinalReading: reading.oldMeterFinalReading,
  });
}

function moneyChanged(a: number | undefined, b: number) {
  return Math.abs(Number(a || 0) - Number(b || 0)) >= 0.01;
}

function inferPaymentLinks(
  payment: Payment,
  readings: MeterReading[]
): ParsedBillId | null {
  const parsed = parseBillId(String(payment.billId || ""));

  if (parsed) {
    return parsed;
  }

  if (payment.periodId && payment.waterUserId) {
    return {
      periodId: payment.periodId,
      waterUserId: payment.waterUserId,
    };
  }

  if (payment.readingId) {
    const reading = readings.find((item) => item.id === payment.readingId);

    if (reading) {
      return {
        periodId: reading.periodId,
        waterUserId: reading.waterUserId,
      };
    }
  }

  return null;
}

function hasServiceOnlyLegacyNote(reading: MeterReading) {
  const note = String(reading.note || "")
    .replace(/\s+/g, "")
    .toLowerCase();

  return (
    note.includes("เฉพาะค่าบริการ") ||
    note.includes("service_only") ||
    note.includes("serviceonly") ||
    note.includes("ค่าบริการเท่านั้น")
  );
}

function isServiceOnlyLegacyIssue(reading: MeterReading) {
  if (!hasServiceOnlyLegacyNote(reading)) {
    return false;
  }

  const previousReading = Number(reading.previousReading || 0);
  const currentReading = Number(reading.currentReading || 0);

  return (
    reading.billingMode !== "service_only" ||
    String(reading.meterStatus || "") !== "service_only" ||
    Number(reading.usedUnits || 0) !== 0 ||
    Number(reading.waterAmount || 0) !== 0 ||
    currentReading !== previousReading
  );
}

function normalizeServiceOnlyReading(reading: MeterReading): MeterReading {
  if (!hasServiceOnlyLegacyNote(reading)) {
    return reading;
  }

  const previousReading = Number(reading.previousReading || reading.currentReading || 0);

  const serviceFee =
    Number(reading.serviceFee || 0) > 0
      ? Number(reading.serviceFee)
      : Number(reading.totalAmount || 0) > 0
        ? Number(reading.totalAmount)
        : 0;

  return {
    ...reading,
    previousReading,
    currentReading: previousReading,
    usedUnits: 0,
    unitPrice: Number(reading.unitPrice || 0),
    waterAmount: 0,
    serviceFee,
    totalAmount: serviceFee,
    billingMode: "service_only",
    meterStatus: "service_only",
    oldMeterFinalReading: null,
    oldMeterUnits: 0,
    newMeterUnits: 0,
    isRollover: false,
    isBackward: false,
    note: reading.note || `เฉพาะค่าบริการ ${serviceFee} บาท`,
  };
}


export default function DataDoctorPage() {
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

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function refreshData() {
    setSettings(getStoredSettings());
    setCurrentPeriod(getStoredCurrentPeriod());
    setUsers(getStoredWaterUsers());
    setReadings(getStoredMeterReadings());
    setPayments(getStoredPayments());
  }

  useEffect(() => {
    refreshData();
  }, []);

  const doctor = useMemo(() => {
    const userIds = new Set(users.map((user) => user.id));

    const missingUserReadings = readings.filter(
      (reading) => !userIds.has(reading.waterUserId)
    );

    const duplicateReadingGroups = getDuplicateCount(readings);

    const readingBillIds = new Set(
      readings.map((reading) => makeBillId(reading.periodId, reading.waterUserId))
    );

    const paymentLinks = payments.map((payment) => ({
      payment,
      inferred: inferPaymentLinks(payment, readings),
    }));

    const orphanPayments = paymentLinks
      .filter(({ inferred }) => {
        if (!inferred) {
          return false;
        }

        if (inferred.periodId !== currentPeriod.id) {
          return false;
        }

        return !readingBillIds.has(
          makeBillId(inferred.periodId, inferred.waterUserId)
        );
      })
      .map(({ payment }) => payment);

    const oldPeriodPayments = paymentLinks
      .filter(({ inferred }) => inferred?.periodId !== currentPeriod.id)
      .map(({ payment }) => payment);

    const missingPaymentLinks = paymentLinks
      .filter(({ payment, inferred }) => {
        if (!inferred) {
          return false;
        }

        if (inferred.periodId !== currentPeriod.id) {
          return false;
        }

        return (
          !payment.periodId ||
          !payment.waterUserId ||
          !payment.billId ||
          payment.periodId !== inferred.periodId ||
          payment.waterUserId !== inferred.waterUserId ||
          payment.billId !== makeBillId(inferred.periodId, inferred.waterUserId)
        );
      })
      .map(({ payment }) => payment);

    const wrongReadingAmounts = readings.filter((reading) => {
      const user = users.find((item) => item.id === reading.waterUserId);
      const calculation = getReadingCalculation(reading, user, settings);

      return (
        Number(reading.usedUnits || 0) !== calculation.usedUnits ||
        moneyChanged(reading.waterAmount, calculation.waterAmount) ||
        moneyChanged(reading.serviceFee, calculation.serviceFee) ||
        moneyChanged(reading.totalAmount, calculation.totalAmount) ||
        reading.meterStatus !== calculation.meterStatus
      );
    });

    const serviceOnlyWarnings = readings.filter(
      (reading) =>
        reading.periodId === currentPeriod.id && isServiceOnlyLegacyIssue(reading)
    );

    const currentPeriodReadings = readings.filter(
      (reading) => reading.periodId === currentPeriod.id
    );

    const currentPeriodPayments = payments.filter((payment) =>
      payment.billId.includes(currentPeriod.id)
    );

    const issues: DoctorIssue[] = [
      {
        id: "users",
        level: users.length > 0 ? "ok" : "error",
        title: "users ต้องไม่ว่าง",
        detail:
          users.length > 0
            ? "มีข้อมูลผู้ใช้น้ำในระบบ"
            : "ไม่พบ users ระบบจะลิ้งรายงาน/ใบเสร็จไม่ได้",
        count: users.length,
      },
      {
        id: "missing-user-readings",
        level: missingUserReadings.length === 0 ? "ok" : "error",
        title: "readings ต้องหา user เจอ",
        detail:
          missingUserReadings.length === 0
            ? "รายการจดมิเตอร์ทุกตัวมีผู้ใช้น้ำรองรับ"
            : "มี readings ที่ waterUserId ไม่พบใน users",
        count: missingUserReadings.length,
      },
      {
        id: "duplicates",
        level: duplicateReadingGroups === 0 ? "ok" : "warning",
        title: "รายการจดมิเตอร์ซ้ำ",
        detail:
          duplicateReadingGroups === 0
            ? "ไม่พบรายการซ้ำในรอบเดียวกัน"
            : "พบ periodId + waterUserId ซ้ำ ควรเหลือรายการล่าสุดรายการเดียว",
        count: duplicateReadingGroups,
      },
      {
        id: "orphan-payments",
        level: orphanPayments.length === 0 ? "ok" : "warning",
        title: "payments รอบปัจจุบันที่หา reading ไม่เจอ",
        detail:
          orphanPayments.length === 0
            ? "payments รอบปัจจุบันทุกตัวมีบิลอ้างอิง"
            : "มี payments ในรอบปัจจุบันที่ไม่มี reading รองรับ",
        count: orphanPayments.length,
      },
      {
        id: "payment-links",
        level: missingPaymentLinks.length === 0 ? "ok" : "warning",
        title: "payments รอบปัจจุบันขาด periodId / waterUserId",
        detail:
          missingPaymentLinks.length === 0
            ? "payment link fields ของรอบปัจจุบันครบ"
            : "บาง payment ในรอบปัจจุบันต้องเติม periodId/waterUserId จาก billId",
        count: missingPaymentLinks.length,
      },
      {
        id: "amounts",
        level: wrongReadingAmounts.length === 0 ? "ok" : "warning",
        title: "ยอดคำนวณไม่ตรง Billing Core V4",
        detail:
          wrongReadingAmounts.length === 0
            ? "ยอดจดมิเตอร์ตรงกับสูตรกลาง"
            : "บางรายการควรถูกคำนวณใหม่จาก Billing Core V4",
        count: wrongReadingAmounts.length,
      },
      {
        id: "service-only-note",
        level: serviceOnlyWarnings.length === 0 ? "ok" : "warning",
        title: "หมายเหตุเฉพาะค่าบริการ แต่ mode เป็นปกติ",
        detail:
          serviceOnlyWarnings.length === 0
            ? "ไม่มีรายการประเภทนี้"
            : "กดซ่อมข้อมูลแบบปลอดภัย ระบบจะปรับเป็น service_only ให้ทันที",
        count: serviceOnlyWarnings.length,
      },
    ];

    const errorCount = issues.filter((issue) => issue.level === "error").length;
    const warningCount = issues.filter(
      (issue) => issue.level === "warning"
    ).length;

    return {
      issues,
      errorCount,
      warningCount,
      currentPeriodReadings,
      currentPeriodPayments,
      oldPeriodPayments,
      missingUserReadings,
      orphanPayments,
      wrongReadingAmounts,
      serviceOnlyWarnings,
    };
  }, [users, readings, payments, settings, currentPeriod.id]);

  function showMessage(text: string) {
    setMessage(text);
    setError("");
    window.setTimeout(() => setMessage(""), 3000);
  }

  function showError(text: string) {
    setError(text);
    setMessage("");
  }

  function forceFixServiceOnlyLegacyRows() {
    const now = getNowIso();

    const nextReadings = readings.map((reading) => {
      if (reading.periodId !== currentPeriod.id) {
        return reading;
      }

      return normalizeServiceOnlyReading(reading);
    });

    const serviceOnlyByUserId = new Map<string, MeterReading>();

    nextReadings.forEach((reading) => {
      if (
        reading.periodId === currentPeriod.id &&
        reading.billingMode === "service_only"
      ) {
        serviceOnlyByUserId.set(reading.waterUserId, reading);
      }
    });

    const nextUsers: WaterUser[] = users.map((user): WaterUser => {
      const reading = serviceOnlyByUserId.get(user.id);

      if (!reading) {
        return user;
      }

      return {
        ...user,
        serviceOnly: true,
        defaultBillingMode: "service_only" as const,
        userStatus: "SERVICE_ONLY" as const,
        serviceFeeOverride: Number(
          reading.serviceFee || user.serviceFeeOverride || 0
        ),
        updatedAt: now,
      };
    });

    saveStoredMeterReadings(nextReadings);
    saveStoredWaterUsers(nextUsers);

    setReadings(nextReadings);
    setUsers(nextUsers);

    showMessage("เคลียร์หมายเหตุเฉพาะค่าบริการแล้ว");
  }

  function handleSafeRepair() {
    try {
      const now = getNowIso();

      let nextUsers = [...users];
      const userIds = new Set(nextUsers.map((user) => user.id));

      readings.forEach((reading, index) => {
        if (!userIds.has(reading.waterUserId)) {
          const placeholder = makePlaceholderUserFromReading(reading, index);

          nextUsers.push(placeholder);
          userIds.add(placeholder.id);
        }
      });

      const dedupedReadings = deduplicateReadings(readings);

      const nextReadings = dedupedReadings.map((reading) => {
        const normalizedReading = normalizeServiceOnlyReading(reading);
        const user = nextUsers.find(
          (item) => item.id === normalizedReading.waterUserId
        );
        const calculation = getReadingCalculation(normalizedReading, user, settings);

        return {
          ...normalizedReading,
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
          meterMaxValue: Number(reading.meterMaxValue ?? settings.meterMaxValue),
          updatedAt: now,
        };
      });

      const serviceOnlyUserIds = new Set(
        nextReadings
          .filter((reading) => reading.billingMode === "service_only")
          .map((reading) => reading.waterUserId)
      );

      nextUsers = nextUsers.map((user) => {
        if (!serviceOnlyUserIds.has(user.id)) {
          return user;
        }

        const serviceOnlyReading = nextReadings.find(
          (reading) =>
            reading.waterUserId === user.id &&
            reading.billingMode === "service_only"
        );

        return {
          ...user,
          serviceOnly: true,
          defaultBillingMode: "service_only" as const,
          userStatus: "SERVICE_ONLY" as const,
          serviceFeeOverride: Number(
            serviceOnlyReading?.serviceFee || user.serviceFeeOverride || 0
          ),
          updatedAt: now,
        };
      });

      const nextReadingByBillId = new Map<string, MeterReading>();

      nextReadings.forEach((reading) => {
        nextReadingByBillId.set(
          makeBillId(reading.periodId, reading.waterUserId),
          reading
        );
      });

      const nextPayments = payments.map((payment) => {
        const inferred = inferPaymentLinks(payment, nextReadings);

        if (!inferred) {
          return {
            ...payment,
            status: payment.status || "paid",
            updatedAt: now,
          };
        }

        const normalizedBillId = makeBillId(
          inferred.periodId,
          inferred.waterUserId
        );
        const linkedReading = nextReadingByBillId.get(normalizedBillId);

        return {
          ...payment,
          billId: normalizedBillId,
          periodId: inferred.periodId,
          waterUserId: inferred.waterUserId,
          readingId: linkedReading?.id || payment.readingId,
          amount: Number(linkedReading?.totalAmount || payment.amount || 0),
          status: payment.status || "paid",
          updatedAt: now,
        };
      });

      saveStoredWaterUsers(nextUsers);
      saveStoredMeterReadings(nextReadings);
      saveStoredPayments(nextPayments);

      refreshData();

      showMessage("ซ่อมข้อมูลแบบปลอดภัยแล้ว");
    } catch (repairError) {
      showError(
        repairError instanceof Error
          ? repairError.message
          : "ซ่อมข้อมูลไม่สำเร็จ"
      );
    }
  }

  function handleDownloadDoctorBackup() {
    try {
      const data = exportAllData();
      const fileName = `doctor-backup-water-billing-${Date.now()}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = fileName;
      link.click();

      URL.revokeObjectURL(url);
      showMessage("ดาวน์โหลด Backup หลังตรวจแล้ว");
    } catch {
      showError("ดาวน์โหลด Backup ไม่สำเร็จ");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-purple-900 to-blue-700 px-4 pb-24 pt-5 text-white">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-white/10" />

        <div className="relative mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/" className="text-sm font-bold text-blue-100">
                ← กลับหน้าหลัก
              </Link>

              <h1 className="mt-5 text-3xl font-black tracking-tight">
                Data Doctor
              </h1>

              <p className="mt-1 text-sm text-blue-100">
                ตรวจ/ซ่อม users · readings · payments ที่หลุดลิ้ง
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
                onClick={handleDownloadDoctorBackup}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-700 shadow-sm"
              >
                Backup ตอนนี้
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">ผู้ใช้น้ำ</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiNumber(users.length)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">จดมิเตอร์</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiNumber(readings.length)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">รับชำระ</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiNumber(payments.length)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">ปัญหาที่พบ</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiNumber(doctor.errorCount + doctor.warningCount)}
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

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                สรุปสุขภาพข้อมูล
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                รอบบิลปัจจุบัน: {currentPeriod.periodName} · {currentPeriod.id}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={forceFixServiceOnlyLegacyRows}
                className="rounded-2xl bg-orange-600 px-5 py-4 text-sm font-black text-white shadow"
              >
                เคลียร์เฉพาะค่าบริการ
              </button>

              <button
                onClick={handleSafeRepair}
                className="rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow"
              >
                ซ่อมข้อมูลแบบปลอดภัย
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {doctor.issues.map((issue) => (
              <div
                key={issue.id}
                className={
                  issue.level === "ok"
                    ? "rounded-3xl border border-emerald-200 bg-emerald-50 p-4"
                    : issue.level === "warning"
                      ? "rounded-3xl border border-orange-200 bg-orange-50 p-4"
                      : "rounded-3xl border border-red-200 bg-red-50 p-4"
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900">{issue.title}</p>

                    <p className="mt-1 text-sm text-slate-600">
                      {issue.detail}
                    </p>
                  </div>

                  <span
                    className={
                      issue.level === "ok"
                        ? "rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white"
                        : issue.level === "warning"
                          ? "rounded-full bg-orange-600 px-3 py-1 text-xs font-black text-white"
                          : "rounded-full bg-red-600 px-3 py-1 text-xs font-black text-white"
                    }
                  >
                    {issue.level === "ok" ? "ผ่าน" : formatThaiNumber(issue.count)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black text-slate-900">
              ข้อมูลรอบปัจจุบัน
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-blue-50 p-4">
                <p className="text-sm font-bold text-blue-700">
                  จดมิเตอร์รอบนี้
                </p>

                <p className="mt-1 text-2xl font-black text-blue-900">
                  {formatThaiNumber(doctor.currentPeriodReadings.length)}
                </p>
              </div>

              <div className="rounded-3xl bg-emerald-50 p-4">
                <p className="text-sm font-bold text-emerald-700">
                  รับชำระรอบนี้
                </p>

                <p className="mt-1 text-2xl font-black text-emerald-900">
                  {formatThaiNumber(doctor.currentPeriodPayments.length)}
                </p>
              </div>

              <div className="rounded-3xl bg-orange-50 p-4">
                <p className="text-sm font-bold text-orange-700">
                  payments คนละรอบ
                </p>

                <p className="mt-1 text-2xl font-black text-orange-900">
                  {formatThaiNumber(doctor.oldPeriodPayments.length)}
                </p>
              </div>

              <div className="rounded-3xl bg-purple-50 p-4">
                <p className="text-sm font-bold text-purple-700">
                  ต้องคำนวณใหม่
                </p>

                <p className="mt-1 text-2xl font-black text-purple-900">
                  {formatThaiNumber(doctor.wrongReadingAmounts.length)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black text-slate-900">
              ปุ่มลัดตรวจต่อ
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link
                href="/backup"
                className="rounded-3xl bg-blue-600 px-5 py-5 text-center font-black text-white shadow"
              >
                Backup / Restore
              </Link>

              <Link
                href="/reports"
                className="rounded-3xl bg-slate-900 px-5 py-5 text-center font-black text-white shadow"
              >
                รายงาน
              </Link>

              <Link
                href="/payments"
                className="rounded-3xl bg-emerald-600 px-5 py-5 text-center font-black text-white shadow"
              >
                รับชำระ
              </Link>

              <Link
                href="/meter-reading"
                className="rounded-3xl bg-purple-600 px-5 py-5 text-center font-black text-white shadow"
              >
                จดมิเตอร์
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-black text-slate-900">
            รายการที่ควรตรวจเอง
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            ถ้ายังเหลือหมายเหตุเฉพาะค่าบริการ ให้กดปุ่ม “เคลียร์เฉพาะค่าบริการ”
            เพื่อปรับเป็น service_only ทันที
          </p>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">รอบบิล</th>
                  <th className="px-4 py-3">ผู้ใช้น้ำ</th>
                  <th className="px-4 py-3">รายละเอียด</th>
                  <th className="px-4 py-3 text-right">ยอด</th>
                </tr>
              </thead>

              <tbody>
                {doctor.serviceOnlyWarnings.length === 0 &&
                doctor.orphanPayments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      ไม่มีรายการที่ต้องตรวจเอง
                    </td>
                  </tr>
                ) : (
                  <>
                    {doctor.serviceOnlyWarnings.slice(0, 20).map((reading) => {
                      const user = users.find(
                        (item) => item.id === reading.waterUserId
                      );
                      const calculation = getReadingCalculation(
                        reading,
                        user,
                        settings
                      );

                      return (
                        <tr
                          key={`service-${reading.periodId}-${reading.waterUserId}`}
                          className="border-t border-slate-100"
                        >
                          <td className="px-4 py-3 font-black text-orange-700">
                            ตรวจ mode
                          </td>
                          <td className="px-4 py-3">{reading.periodId}</td>
                          <td className="px-4 py-3">
                            {user?.fullName || reading.waterUserId}
                          </td>
                          <td className="px-4 py-3">
                            {getBillingModeLabel(
                              calculation.billingMode
                            )} · {getMeterStatusLabel(calculation.meterStatus)} ·{" "}
                            {reading.note}
                          </td>
                          <td className="px-4 py-3 text-right font-black">
                            {formatThaiCurrency(calculation.totalAmount)}
                          </td>
                        </tr>
                      );
                    })}

                    {doctor.orphanPayments.slice(0, 20).map((payment) => (
                      <tr
                        key={`orphan-${payment.id}`}
                        className="border-t border-slate-100"
                      >
                        <td className="px-4 py-3 font-black text-red-700">
                          Payment เก่า
                        </td>
                        <td className="px-4 py-3">
                          {parseBillId(payment.billId)?.periodId || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {parseBillId(payment.billId)?.waterUserId || "-"}
                        </td>
                        <td className="px-4 py-3">{payment.billId}</td>
                        <td className="px-4 py-3 text-right font-black">
                          {formatThaiCurrency(payment.amount)}
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
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
            href="/backup"
            className="rounded-2xl px-2 py-2 font-bold text-slate-500"
          >
            <div className="text-lg">💾</div>
            Backup
          </Link>

          <Link
            href="/data-doctor"
            className="rounded-2xl bg-blue-50 px-2 py-2 font-black text-blue-700"
          >
            <div className="text-lg">🩺</div>
            Doctor
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
