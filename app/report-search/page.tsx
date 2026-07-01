"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  formatThaiCurrency,
  formatThaiNumber,
} from "../../lib/billing";
import { loadWaterAppData } from "../../lib/app-data-client";
import { currentBillingPeriod } from "../../lib/mock-data";
import {
  buildReportRows,
  getPeriodNumber,
} from "../../lib/reports";
import type {
  BillingPeriod,
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../../types/water-system";

type StatusFilter = "all" | "paid" | "unpaid";

const thaiMonths = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function getPeriodLabel(periodId: string, currentPeriod: BillingPeriod) {
  if (periodId === currentPeriod.id) {
    return currentPeriod.periodName;
  }

  const match = periodId.match(/period-(\d{4})-(\d{2})/);

  if (!match) {
    return periodId;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  const thaiYear = year > 2400 ? year : year + 543;
  const monthName = thaiMonths[month - 1] || `เดือน ${month}`;

  return `${monthName} ${thaiYear}`;
}

export default function ReportSearchPage() {
  const [currentPeriod, setCurrentPeriod] =
    useState<BillingPeriod>(currentBillingPeriod);

  const [users, setUsers] = useState<WaterUser[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settings, setSettings] = useState<WaterSettings>({
    villageName: "",
    serviceFee: 20,
    unitPrice: 8,
    meterMaxValue: 9999,
  });

  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    async function refreshData() {
      try {
        const data = await loadWaterAppData();

        setCurrentPeriod(data.currentPeriod);
        setUsers(data.users);
        setReadings(data.readings);
        setPayments(data.payments);
        setSettings(data.settings);
        setSelectedPeriodId(data.currentPeriod.id);
      } catch (error) {
        console.error(error);
      }
    }

    void refreshData();
  }, []);

  const periodIds = useMemo(() => {
    const ids = new Set<string>();

    ids.add(currentPeriod.id);

    readings.forEach((reading) => {
      if (reading.periodId) {
        ids.add(reading.periodId);
      }
    });

    return Array.from(ids).sort(
      (a, b) => getPeriodNumber(b) - getPeriodNumber(a)
    );
  }, [readings, currentPeriod.id]);

  const reportRows = useMemo(() => {
    if (!selectedPeriodId) {
      return [];
    }

    return buildReportRows(
      selectedPeriodId,
      users,
      readings,
      payments,
      settings
    );
  }, [selectedPeriodId, users, readings, payments, settings]);

  const filteredRows = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    return reportRows
      .filter((row) => {
        if (statusFilter === "paid") {
          return row.isPaid;
        }

        if (statusFilter === "unpaid") {
          return !row.isPaid;
        }

        return true;
      })
      .filter((row) => {
        if (!query) {
          return true;
        }

        return [
          row.billId,
          row.user?.userCode,
          row.user?.fullName,
          row.user?.address,
          row.user?.villageNo,
          row.user?.phone,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [reportRows, keyword, statusFilter]);

  const paidRows = reportRows.filter((row) => row.isPaid);
  const unpaidRows = reportRows.filter((row) => !row.isPaid);

  const totalUnits = reportRows.reduce(
    (sum, row) => sum + row.calculation.usedUnits,
    0
  );

  const totalWaterAmount = reportRows.reduce(
    (sum, row) => sum + row.calculation.waterAmount,
    0
  );

  const totalServiceFee = reportRows.reduce(
    (sum, row) => sum + row.calculation.serviceFee,
    0
  );

  const totalAmount = reportRows.reduce(
    (sum, row) => sum + row.calculation.totalAmount,
    0
  );

  const totalPaid = paidRows.reduce(
    (sum, row) => sum + row.calculation.totalAmount,
    0
  );

  const totalUnpaid = unpaidRows.reduce(
    (sum, row) => sum + row.calculation.totalAmount,
    0
  );

  const paidPercent =
    totalAmount === 0 ? 0 : Math.round((totalPaid / totalAmount) * 100);

  const selectedPeriodLabel = selectedPeriodId
    ? getPeriodLabel(selectedPeriodId, currentPeriod)
    : "-";

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 px-4 pb-24 pt-5 text-white">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/10" />

        <div className="relative mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href="/" className="text-sm font-bold text-blue-100">
                ← กลับหน้าหลัก
              </Link>

              <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight">
                ค้นหารายงานย้อนหลัง
              </h1>

              <p className="mt-1 text-sm text-blue-100">
                เลือกรอบบิล ดูยอดย้อนหลัง และเปิดเอกสารรายคน
              </p>
            </div>

            <Link
              href="/reports"
              className="rounded-2xl border border-white/30 bg-white/15 px-4 py-2 text-xs font-black text-white shadow-sm backdrop-blur"
            >
              รายงานปัจจุบัน
            </Link>
          </div>

          <div className="mt-6 rounded-3xl border border-white/25 bg-white/15 p-5 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-blue-100">รอบบิลที่เลือก</p>
                <p className="mt-1 text-2xl font-black">
                  {selectedPeriodLabel}
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm text-blue-100">เก็บแล้ว</p>
                <p className="mt-1 text-2xl font-black">
                  {formatThaiNumber(paidPercent)}%
                </p>
              </div>
            </div>

            <div className="mt-4 h-3 rounded-full bg-white/20">
              <div
                className="h-3 rounded-full bg-white"
                style={{ width: `${paidPercent}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto -mt-16 max-w-6xl px-4">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <label className="text-sm font-black text-slate-700">
            เลือกรอบบิล
          </label>

          <select
            value={selectedPeriodId}
            onChange={(event) => setSelectedPeriodId(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-lg font-black text-slate-900 outline-none focus:border-blue-500"
          >
            {periodIds.map((periodId) => (
              <option key={periodId} value={periodId}>
                {getPeriodLabel(periodId, currentPeriod)}
              </option>
            ))}
          </select>

          <p className="mt-2 text-xs text-slate-500">
            ระบบดึงรอบบิลจากข้อมูลการจดมิเตอร์ที่เคยบันทึกไว้
          </p>
        </section>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-xl">
              💧
            </div>

            <p className="mt-4 text-3xl font-black text-slate-900">
              {formatThaiNumber(totalUnits)}
            </p>

            <p className="mt-1 text-sm font-medium text-slate-500">
              หน่วยน้ำรวม
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-xl">
              🧾
            </div>

            <p className="mt-4 text-2xl font-black text-blue-700">
              {formatThaiCurrency(totalAmount)}
            </p>

            <p className="mt-1 text-sm font-medium text-slate-500">
              ยอดรวมทั้งหมด
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-xl">
              ✅
            </div>

            <p className="mt-4 text-2xl font-black text-emerald-700">
              {formatThaiCurrency(totalPaid)}
            </p>

            <p className="mt-1 text-sm font-medium text-slate-500">
              ชำระแล้ว {paidRows.length.toLocaleString("th-TH")} ราย
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-xl">
              ⏳
            </div>

            <p className="mt-4 text-2xl font-black text-red-700">
              {formatThaiCurrency(totalUnpaid)}
            </p>

            <p className="mt-1 text-sm font-medium text-slate-500">
              ค้างชำระ {unpaidRows.length.toLocaleString("th-TH")} ราย
            </p>
          </div>
        </div>

        <section className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-500">ค่าน้ำรวม</p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              {formatThaiCurrency(totalWaterAmount)}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-500">ค่าบริการรวม</p>
            <p className="mt-2 text-2xl font-black text-orange-700">
              {formatThaiCurrency(totalServiceFee)}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-500">จำนวนบิล</p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              {formatThaiNumber(reportRows.length)} รายการ
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="ค้นหา รหัส / ชื่อ / บ้านเลขที่ / หมู่"
            className="w-full rounded-2xl border border-slate-200 px-5 py-4 text-lg outline-none focus:border-blue-500"
          />

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={
                statusFilter === "all"
                  ? "rounded-2xl bg-blue-600 px-3 py-3 text-sm font-black text-white"
                  : "rounded-2xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-600"
              }
            >
              ทั้งหมด
            </button>

            <button
              onClick={() => setStatusFilter("unpaid")}
              className={
                statusFilter === "unpaid"
                  ? "rounded-2xl bg-red-600 px-3 py-3 text-sm font-black text-white"
                  : "rounded-2xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-600"
              }
            >
              ค้างชำระ
            </button>

            <button
              onClick={() => setStatusFilter("paid")}
              className={
                statusFilter === "paid"
                  ? "rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-black text-white"
                  : "rounded-2xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-600"
              }
            >
              จ่ายแล้ว
            </button>
          </div>
        </section>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">
            รายการย้อนหลัง
          </h2>

          <p className="text-sm font-bold text-slate-500">
            {filteredRows.length.toLocaleString("th-TH")} รายการ
          </p>
        </div>

        {filteredRows.length === 0 ? (
          <section className="mt-3 rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-3xl">
              📄
            </div>

            <h2 className="mt-4 text-2xl font-black text-slate-900">
              ไม่พบข้อมูลในรอบบิลนี้
            </h2>

            <p className="mt-2 text-slate-500">
              ลองเลือกรอบบิลอื่น หรือเปลี่ยนคำค้นหา
            </p>
          </section>
        ) : (
          <section className="mt-3 space-y-3">
            {filteredRows.map((row) => {
              const user = row.user;

              return (
                <div
                  key={row.billId}
                  className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-500">
                        รหัส {user?.userCode || "-"}
                      </p>

                      <h3 className="mt-1 text-lg font-black text-slate-900">
                        {user?.fullName || "ไม่พบผู้ใช้น้ำ"}
                      </h3>

                      <p className="mt-1 text-sm text-slate-600">
                        บ้านเลขที่ {user?.address || "-"} หมู่{" "}
                        {user?.villageNo || "-"}
                      </p>

                      {user?.serviceOnly ? (
                        <p className="mt-2 inline-flex rounded-full bg-orange-50 px-3 py-1 text-sm font-black text-orange-700">
                          เฉพาะค่าบริการ{" "}
                          {formatThaiCurrency(row.calculation.serviceFee)}
                        </p>
                      ) : null}
                    </div>

                    <span
                      className={
                        row.isPaid
                          ? "shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"
                          : "shrink-0 rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700"
                      }
                    >
                      {row.isPaid ? "จ่ายแล้ว" : "ค้างชำระ"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-bold text-slate-500">
                        เลขมิเตอร์
                      </p>

                      <p className="mt-1 text-sm font-black text-slate-900">
                        {formatThaiNumber(row.reading.previousReading)} →{" "}
                        {formatThaiNumber(row.reading.currentReading)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-bold text-slate-500">
                        หน่วยที่ใช้
                      </p>

                      <p className="mt-1 text-sm font-black text-slate-900">
                        {formatThaiNumber(row.calculation.usedUnits)} หน่วย
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-3xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">ค่าน้ำ</span>
                      <b>{formatThaiCurrency(row.calculation.waterAmount)}</b>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-slate-600">ค่าบริการ</span>
                      <b>{formatThaiCurrency(row.calculation.serviceFee)}</b>
                    </div>

                    <div className="mt-4 rounded-2xl bg-blue-50 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-black text-slate-900">
                          รวม
                        </span>

                        <b className="text-2xl font-black text-blue-700">
                          {formatThaiCurrency(row.calculation.totalAmount)}
                        </b>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Link
                      href={`/receipt?billId=${row.billId}&mode=invoice`}
                      className="rounded-2xl border border-blue-200 px-4 py-3 text-center font-black text-blue-700"
                    >
                      ใบแจ้งหนี้
                    </Link>

                    <Link
                      href={`/receipt?billId=${row.billId}&mode=receipt`}
                      className="rounded-2xl bg-blue-600 px-4 py-3 text-center font-black text-white shadow"
                    >
                      ใบเสร็จ
                    </Link>
                  </div>
                </div>
              );
            })}
          </section>
        )}
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
            className="rounded-2xl bg-blue-50 px-2 py-2 font-black text-blue-700"
          >
            <div className="text-lg">📊</div>
            รายงาน
          </Link>
        </div>
      </nav>
    </main>
  );
}
