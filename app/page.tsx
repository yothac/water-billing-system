"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  calculateWaterBillV4,
  formatThaiCurrency,
  formatThaiNumber,
} from "../lib/billing";
import { getUserServiceFee } from "../lib/service-fee";
import { loadWaterAppData } from "../lib/app-data-client";
import type {
  BillingMode,
  BillingPeriod,
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../types/water-system";

interface DashboardCard {
  title: string;
  desc: string;
  href: string;
  icon: string;
  badge?: string;
  tone: "blue" | "emerald" | "orange" | "purple" | "slate" | "red" | "cyan";
}

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

function getToneClass(tone: DashboardCard["tone"]) {
  switch (tone) {
    case "emerald":
      return "border-emerald-100 bg-emerald-50 text-emerald-700";
    case "orange":
      return "border-orange-100 bg-orange-50 text-orange-700";
    case "purple":
      return "border-purple-100 bg-purple-50 text-purple-700";
    case "red":
      return "border-red-100 bg-red-50 text-red-700";
    case "cyan":
      return "border-cyan-100 bg-cyan-50 text-cyan-700";
    case "slate":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-blue-100 bg-blue-50 text-blue-700";
  }
}

function getButtonClass(tone: DashboardCard["tone"]) {
  switch (tone) {
    case "emerald":
      return "bg-emerald-600";
    case "orange":
      return "bg-orange-600";
    case "purple":
      return "bg-purple-600";
    case "red":
      return "bg-red-600";
    case "cyan":
      return "bg-cyan-600";
    case "slate":
      return "bg-slate-900";
    default:
      return "bg-blue-600";
  }
}

export default function HomePage() {
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

  async function refreshData() {
    try {
      const data = await loadWaterAppData();

      setSettings(data.settings);
      setCurrentPeriod(data.currentPeriod);
      setUsers(data.users);
      setReadings(data.readings);
      setPayments(data.payments);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    void refreshData();
  }, []);

  const dashboard = useMemo(() => {
    const activeUsers = users.filter(isActiveUser);
    const periodReadings = readings.filter(
      (reading) => reading.periodId === currentPeriod.id
    );

    const paidBillIds = new Set(
      payments
        .filter((payment) => payment.status !== "cancelled")
        .map((payment) => payment.billId)
    );

    const calculatedRows = periodReadings.map((reading) => {
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
        reading,
        user,
        billId,
        totalAmount: calculation.totalAmount,
        usedUnits: calculation.usedUnits,
        isPaid: paidBillIds.has(billId),
      };
    });

    const totalAmount = calculatedRows.reduce(
      (sum, row) => sum + row.totalAmount,
      0
    );

    const paidAmount = calculatedRows.reduce(
      (sum, row) => sum + (row.isPaid ? row.totalAmount : 0),
      0
    );

    const unpaidAmount = totalAmount - paidAmount;

    const completedCount = periodReadings.length;
    const totalCount = activeUsers.length;
    const remainingCount = Math.max(totalCount - completedCount, 0);
    const paidCount = calculatedRows.filter((row) => row.isPaid).length;
    const unpaidCount = Math.max(completedCount - paidCount, 0);
    const progressPercent =
      totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

    const missingUserLinks = periodReadings.filter(
      (reading) => !users.some((user) => user.id === reading.waterUserId)
    ).length;

    return {
      activeUsers,
      periodReadings,
      completedCount,
      totalCount,
      remainingCount,
      paidCount,
      unpaidCount,
      totalAmount,
      paidAmount,
      unpaidAmount,
      progressPercent,
      missingUserLinks,
    };
  }, [users, readings, payments, currentPeriod.id, settings]);

  const primaryCards: DashboardCard[] = [
    {
      title: "จดมิเตอร์น้ำ",
      desc: "บันทึกเลขมิเตอร์รอบปัจจุบัน",
      href: "/meter-reading",
      icon: "💧",
      badge: `${dashboard.remainingCount} ค้างจด`,
      tone: "blue",
    },
    {
      title: "รับชำระเงิน",
      desc: "รับเงิน / ยกเลิกชำระ / ออกใบเสร็จ",
      href: "/payments",
      icon: "💵",
      badge: `${dashboard.unpaidCount} ค้างชำระ`,
      tone: "emerald",
    },
    {
      title: "รายงาน",
      desc: "ดูยอดรวม สถานะ และรายละเอียดรอบบิล",
      href: "/reports",
      icon: "📊",
      badge: currentPeriod.periodName,
      tone: "purple",
    },
    {
      title: "ผู้ใช้น้ำ",
      desc: "จัดการข้อมูลผู้ใช้น้ำและสถานะมิเตอร์",
      href: "/users",
      icon: "👥",
      badge: `${dashboard.totalCount} ราย`,
      tone: "orange",
    },
  ];

  const documentCards: DashboardCard[] = [
    {
      title: "ใบเสร็จรวม A4",
      desc: "พิมพ์ใบเสร็จ/ใบแจ้งหนี้ 6 ใบต่อหน้า",
      href: "/receipts-bulk",
      icon: "🧾",
      tone: "blue",
    },
    {
      title: "รายงานพิมพ์ A4",
      desc: "ตารางสรุปทั้งรอบบิลสำหรับปริ้น",
      href: "/print-report",
      icon: "🖨️",
      tone: "slate",
    },
    {
      title: "ค้นหารายงาน",
      desc: "ค้นหาใบแจ้งหนี้/ประวัติรายบุคคล",
      href: "/report-search",
      icon: "🔎",
      tone: "cyan",
    },
    {
      title: "ประวัติ",
      desc: "ดูข้อมูลย้อนหลังตามรอบบิล",
      href: "/history",
      icon: "🗂️",
      tone: "purple",
    },
  ];

  const systemCards: DashboardCard[] = [
    {
      title: "ส่งออก CSV/JSON",
      desc: "Export รายงาน ผู้ใช้น้ำ รับชำระ และ Backup",
      href: "/exports",
      icon: "⬇️",
      tone: "emerald",
    },
    {
      title: "Backup / Restore",
      desc: "สำรองข้อมูลและกู้คืนข้อมูลระบบ",
      href: "/backup",
      icon: "💾",
      tone: "blue",
    },
    {
      title: "Data Doctor",
      desc: "ตรวจและซ่อม users/readings/payments ที่หลุดลิ้ง",
      href: "/data-doctor",
      icon: "🩺",
      badge: dashboard.missingUserLinks > 0 ? `${dashboard.missingUserLinks} จุด` : "ปกติ",
      tone: dashboard.missingUserLinks > 0 ? "red" : "emerald",
    },
    {
      title: "ควบคุมรอบบิล",
      desc: "ปิดรอบ ล็อกรอบ เปิดแก้ไข และย้ายรอบถัดไป",
      href: "/period-control",
      icon: "🔐",
      tone: "orange",
    },
    {
      title: "ตั้งค่าระบบ",
      desc: "ตั้งค่าค่าน้ำ รอบบิล ใบเสร็จ และ Login",
      href: "/settings",
      icon: "⚙️",
      tone: "slate",
    },
  ];

  function renderCards(cards: DashboardCard[]) {
    return cards.map((card) => (
      <Link
        key={card.href}
        href={card.href}
        className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-2xl ${getToneClass(
              card.tone
            )}`}
          >
            {card.icon}
          </div>

          {card.badge ? (
            <span
              className={`rounded-full border px-3 py-1 text-xs font-black ${getToneClass(
                card.tone
              )}`}
            >
              {card.badge}
            </span>
          ) : null}
        </div>

        <h3 className="mt-4 text-xl font-black text-slate-900">
          {card.title}
        </h3>

        <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
          {card.desc}
        </p>

        <div
          className={`mt-4 rounded-2xl px-4 py-3 text-center text-sm font-black text-white ${getButtonClass(
            card.tone
          )}`}
        >
          เปิดใช้งาน →
        </div>
      </Link>
    ));
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-900 to-cyan-700 px-4 pb-24 pt-6 text-white">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/10" />

        <div className="relative mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-blue-100">
                Water Billing System · LocalStorage MVP V4
              </p>

              <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight md:text-5xl">
                {settings.villageName || "ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน"}
              </h1>

              <p className="mt-3 text-sm text-blue-100 md:text-base">
                รอบบิล {currentPeriod.periodName} · สถานะ{" "}
                {currentPeriod.status === "locked"
                  ? "ล็อกแล้ว"
                  : currentPeriod.status === "closed"
                    ? "ปิดรอบแล้ว"
                    : "เปิดใช้งาน"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={refreshData}
                className="rounded-2xl border border-white/30 bg-white/15 px-4 py-3 text-sm font-black text-white shadow-sm backdrop-blur"
              >
                รีเฟรช
              </button>

              <Link
                href="/logout"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-700 shadow-sm"
              >
                ออกจากระบบ
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">จดแล้ว</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiNumber(dashboard.completedCount)} /{" "}
                {formatThaiNumber(dashboard.totalCount)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">ค้างจด</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiNumber(dashboard.remainingCount)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">รับแล้ว</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiCurrency(dashboard.paidAmount)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">ค้างชำระ</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiCurrency(dashboard.unpaidAmount)}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <p className="font-black">ความคืบหน้าการจดมิเตอร์</p>
              <p className="font-black">{dashboard.progressPercent}%</p>
            </div>

            <div className="mt-3 h-3 rounded-full bg-white/20">
              <div
                className="h-3 rounded-full bg-white"
                style={{ width: `${dashboard.progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto -mt-16 max-w-7xl px-4">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-3 md:grid-cols-4">
            <Link
              href="/meter-reading"
              className="rounded-3xl bg-blue-600 p-5 text-white shadow"
            >
              <p className="text-sm font-bold text-blue-100">เริ่มงานหลัก</p>
              <p className="mt-1 text-2xl font-black">จดมิเตอร์น้ำ</p>
            </Link>

            <Link
              href="/payments"
              className="rounded-3xl bg-emerald-600 p-5 text-white shadow"
            >
              <p className="text-sm font-bold text-emerald-100">รับเงิน</p>
              <p className="mt-1 text-2xl font-black">รับชำระค่าน้ำ</p>
            </Link>

            <Link
              href="/reports"
              className="rounded-3xl bg-purple-600 p-5 text-white shadow"
            >
              <p className="text-sm font-bold text-purple-100">ตรวจยอด</p>
              <p className="mt-1 text-2xl font-black">รายงานรอบบิล</p>
            </Link>

            <Link
              href="/data-doctor"
              className="rounded-3xl bg-slate-900 p-5 text-white shadow"
            >
              <p className="text-sm font-bold text-slate-300">ซ่อมข้อมูล</p>
              <p className="mt-1 text-2xl font-black">Data Doctor</p>
            </Link>
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-900">เมนูงานหลัก</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {renderCards(primaryCards)}
          </div>
        </section>

        <section className="mt-7">
          <h2 className="mb-3 text-xl font-black text-slate-900">
            เอกสาร / รายงาน / งานพิมพ์
          </h2>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {renderCards(documentCards)}
          </div>
        </section>

        <section className="mt-7">
          <h2 className="mb-3 text-xl font-black text-slate-900">
            ระบบ / สำรองข้อมูล / ตรวจสุขภาพ
          </h2>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {renderCards(systemCards)}
          </div>
        </section>

        <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                สรุปรอบบิลปัจจุบัน
              </h2>

              <p className="mt-1 text-sm font-bold text-slate-500">
                {currentPeriod.periodName} · users → readings → payments →
                reports
              </p>
            </div>

            <Link
              href="/print-report"
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow"
            >
              พิมพ์รายงาน A4
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-700">ยอดรวม</p>
              <p className="mt-1 text-2xl font-black text-blue-900">
                {formatThaiCurrency(dashboard.totalAmount)}
              </p>
            </div>

            <div className="rounded-3xl bg-emerald-50 p-4">
              <p className="text-sm font-bold text-emerald-700">ชำระแล้ว</p>
              <p className="mt-1 text-2xl font-black text-emerald-900">
                {formatThaiNumber(dashboard.paidCount)} ราย
              </p>
            </div>

            <div className="rounded-3xl bg-red-50 p-4">
              <p className="text-sm font-bold text-red-700">ค้างชำระ</p>
              <p className="mt-1 text-2xl font-black text-red-900">
                {formatThaiNumber(dashboard.unpaidCount)} ราย
              </p>
            </div>

            <div className="rounded-3xl bg-orange-50 p-4">
              <p className="text-sm font-bold text-orange-700">ข้อมูลหลุดลิ้ง</p>
              <p className="mt-1 text-2xl font-black text-orange-900">
                {formatThaiNumber(dashboard.missingUserLinks)} จุด
              </p>
            </div>
          </div>
        </section>
      </section>

      <nav className="fixed bottom-3 left-3 right-3 z-20 rounded-3xl border border-slate-200 bg-white/95 px-2 py-2 shadow-xl backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-4 gap-1 text-center text-xs">
          <Link
            href="/"
            className="rounded-2xl bg-blue-50 px-2 py-2 font-black text-blue-700"
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
