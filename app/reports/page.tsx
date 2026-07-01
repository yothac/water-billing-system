"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  calculateWaterBillV4,
  formatThaiCurrency,
  formatThaiNumber,
  getBillingModeLabel,
  getMeterStatusLabel,
  padMeterReading,
} from "../../lib/billing";
import { getUserServiceFee } from "../../lib/service-fee";
import { loadWaterAppData } from "../../lib/app-data-client";
import type {
  BillCalculation,
  BillingMode,
  BillingPeriod,
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../../types/water-system";

type PaymentFilter = "all" | "paid" | "unpaid";
type ModeFilter =
  | "all"
  | "normal"
  | "service_only"
  | "meter_replaced"
  | "disconnected_no_charge";

interface ReportRow {
  billId: string;
  reading: MeterReading;
  user?: WaterUser;
  payment?: Payment;
  calculation: BillCalculation;
  isPaid: boolean;
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

function getThaiDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortRows(rows: ReportRow[]) {
  return [...rows].sort((a, b) => {
    const addressA = String(a.user?.address || a.user?.addressCode || "");
    const addressB = String(b.user?.address || b.user?.addressCode || "");

    return (
      addressA.localeCompare(addressB, "th-TH", { numeric: true }) ||
      String(a.user?.userCode || "").localeCompare(
        String(b.user?.userCode || ""),
        "th-TH",
        { numeric: true }
      )
    );
  });
}

export default function ReportsPage() {
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

  const [keyword, setKeyword] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");

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

  const rows = useMemo<ReportRow[]>(() => {
    const periodReadings = readings.filter(
      (reading) => reading.periodId === currentPeriod.id
    );

    const builtRows = periodReadings.map((reading) => {
      const user = users.find((item) => item.id === reading.waterUserId);
      const billId = makeBillId(reading.periodId, reading.waterUserId);

      const payment = payments.find(
        (item) => item.billId === billId && item.status !== "cancelled"
      );

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
        billId,
        reading,
        user,
        payment,
        calculation,
        isPaid: Boolean(payment),
      };
    });

    return sortRows(builtRows);
  }, [readings, currentPeriod.id, users, payments, settings]);

  const filteredRows = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      const matchKeyword = !query
        ? true
        : [
            row.user?.userCode,
            row.user?.fullName,
            row.user?.address,
            row.user?.addressCode,
            row.user?.villageNo,
            row.reading.note,
            row.billId,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query);

      const matchPayment =
        paymentFilter === "all"
          ? true
          : paymentFilter === "paid"
            ? row.isPaid
            : !row.isPaid;

      const matchMode =
        modeFilter === "all"
          ? true
          : row.calculation.billingMode === modeFilter;

      return matchKeyword && matchPayment && matchMode;
    });
  }, [rows, keyword, paymentFilter, modeFilter]);

  const summary = useMemo(() => {
    const totalBills = rows.length;
    const paidBills = rows.filter((row) => row.isPaid).length;
    const unpaidBills = totalBills - paidBills;

    const totalUnits = rows.reduce(
      (sum, row) => sum + row.calculation.usedUnits,
      0
    );

    const totalWaterAmount = rows.reduce(
      (sum, row) => sum + row.calculation.waterAmount,
      0
    );

    const totalServiceFee = rows.reduce(
      (sum, row) => sum + row.calculation.serviceFee,
      0
    );

    const totalAmount = rows.reduce(
      (sum, row) => sum + row.calculation.totalAmount,
      0
    );

    const paidAmount = rows.reduce(
      (sum, row) => sum + (row.isPaid ? row.calculation.totalAmount : 0),
      0
    );

    const unpaidAmount = totalAmount - paidAmount;

    return {
      totalBills,
      paidBills,
      unpaidBills,
      totalUnits,
      totalWaterAmount,
      totalServiceFee,
      totalAmount,
      paidAmount,
      unpaidAmount,
      normalCount: rows.filter((row) => row.calculation.billingMode === "normal")
        .length,
      serviceOnlyCount: rows.filter(
        (row) => row.calculation.billingMode === "service_only"
      ).length,
      meterReplacedCount: rows.filter(
        (row) => row.calculation.billingMode === "meter_replaced"
      ).length,
      disconnectedCount: rows.filter(
        (row) => row.calculation.billingMode === "disconnected_no_charge"
      ).length,
    };
  }, [rows]);

  const filterButtons: Array<{
    value: PaymentFilter;
    label: string;
  }> = [
    { value: "all", label: "ทั้งหมด" },
    { value: "paid", label: "ชำระแล้ว" },
    { value: "unpaid", label: "ค้างชำระ" },
  ];

  const modeButtons: Array<{
    value: ModeFilter;
    label: string;
  }> = [
    { value: "all", label: "ทุกประเภท" },
    { value: "normal", label: "ปกติ" },
    { value: "service_only", label: "เฉพาะค่าบริการ" },
    { value: "meter_replaced", label: "เปลี่ยนมิเตอร์" },
    { value: "disconnected_no_charge", label: "ตัดมิเตอร์" },
  ];

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-800 to-cyan-600 px-4 pb-24 pt-5 text-white">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-white/10" />

        <div className="relative mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/" className="text-sm font-bold text-blue-100">
                ← กลับหน้าหลัก
              </Link>

              <h1 className="mt-5 text-3xl font-black tracking-tight">
                รายงานค่าน้ำประปา
              </h1>

              <p className="mt-1 text-sm text-blue-100">
                {currentPeriod.periodName} · Data Link Fix
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
                href="/receipts-bulk"
                className="rounded-2xl border border-white/30 bg-white/15 px-4 py-3 text-sm font-black text-white shadow-sm backdrop-blur"
              >
                ใบเสร็จรวม
              </Link>

              <Link
                href="/print-report"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-700 shadow-sm"
              >
                พิมพ์ A4
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">ยอดรวมทั้งหมด</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiCurrency(summary.totalAmount)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">รับแล้ว</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiCurrency(summary.paidAmount)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">ค้างชำระ</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiCurrency(summary.unpaidAmount)}
              </p>
            </div>

            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">จำนวนบิล</p>
              <p className="mt-1 text-3xl font-black">
                {formatThaiNumber(summary.totalBills)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto -mt-16 max-w-7xl px-4">
        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-500">หน่วยรวม</p>
            <p className="mt-1 text-2xl font-black text-blue-700">
              {formatThaiNumber(summary.totalUnits)}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-500">ค่าน้ำรวม</p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {formatThaiCurrency(summary.totalWaterAmount)}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-500">ค่าบริการรวม</p>
            <p className="mt-1 text-2xl font-black text-orange-700">
              {formatThaiCurrency(summary.totalServiceFee)}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-500">ค้างชำระ</p>
            <p className="mt-1 text-2xl font-black text-red-700">
              {formatThaiNumber(summary.unpaidBills)} ราย
            </p>
          </div>
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-bold text-blue-700">ปกติ</p>
            <p className="mt-1 text-2xl font-black text-blue-900">
              {formatThaiNumber(summary.normalCount)}
            </p>
          </div>

          <div className="rounded-3xl border border-orange-100 bg-orange-50 p-4">
            <p className="text-sm font-bold text-orange-700">
              เฉพาะค่าบริการ
            </p>
            <p className="mt-1 text-2xl font-black text-orange-900">
              {formatThaiNumber(summary.serviceOnlyCount)}
            </p>
          </div>

          <div className="rounded-3xl border border-purple-100 bg-purple-50 p-4">
            <p className="text-sm font-bold text-purple-700">เปลี่ยนมิเตอร์</p>
            <p className="mt-1 text-2xl font-black text-purple-900">
              {formatThaiNumber(summary.meterReplacedCount)}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-600">ตัดมิเตอร์</p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {formatThaiNumber(summary.disconnectedCount)}
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
            <div>
              <label className="text-sm font-black text-slate-700">
                ค้นหา
              </label>

              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="ค้นหา รหัส / ชื่อ / บ้าน / หมู่ / หมายเหตุ"
                className="mt-2 w-full rounded-2xl border border-slate-200 px-5 py-4 text-lg outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              {filterButtons.map((button) => (
                <button
                  key={button.value}
                  onClick={() => setPaymentFilter(button.value)}
                  className={
                    paymentFilter === button.value
                      ? "rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow"
                      : "rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-600 ring-1 ring-slate-200"
                  }
                >
                  {button.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {modeButtons.map((button) => (
              <button
                key={button.value}
                onClick={() => setModeFilter(button.value)}
                className={
                  modeFilter === button.value
                    ? "rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow"
                    : "rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-600 ring-1 ring-slate-200"
                }
              >
                {button.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                ตารางรายงานรอบบิล
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                แสดง {formatThaiNumber(filteredRows.length)} จาก{" "}
                {formatThaiNumber(rows.length)} รายการ
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/payments"
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow"
              >
                รับชำระเงิน
              </Link>

              <Link
                href="/exports"
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow"
              >
                ส่งออก CSV
              </Link>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[1180px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อผู้ใช้น้ำ</th>
                  <th className="px-4 py-3">บ้าน/รหัส</th>
                  <th className="px-4 py-3 text-right">ก่อน</th>
                  <th className="px-4 py-3 text-right">หลัง</th>
                  <th className="px-4 py-3 text-right">หน่วย</th>
                  <th className="px-4 py-3 text-right">ค่าน้ำ</th>
                  <th className="px-4 py-3 text-right">ค่าบริการ</th>
                  <th className="px-4 py-3 text-right">รวม</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">เอกสาร</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      ไม่พบข้อมูลรายงาน
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row.billId}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="px-4 py-3 font-black text-slate-900">
                        {row.user?.userCode || "-"}
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">
                          {row.user?.fullName || "ไม่พบผู้ใช้น้ำ"}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          บันทึก {getThaiDateTime(row.reading.recordedAt)}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        {row.user?.address || row.user?.addressCode || "-"}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {padMeterReading(row.calculation.previousReading)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {padMeterReading(row.calculation.currentReading)}
                      </td>

                      <td className="px-4 py-3 text-right font-black">
                        {formatThaiNumber(row.calculation.usedUnits)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {formatThaiCurrency(row.calculation.waterAmount)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {formatThaiCurrency(row.calculation.serviceFee)}
                      </td>

                      <td className="px-4 py-3 text-right text-base font-black text-blue-700">
                        {formatThaiCurrency(row.calculation.totalAmount)}
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-black text-slate-900">
                          {getBillingModeLabel(row.calculation.billingMode)}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {getMeterStatusLabel(row.calculation.meterStatus)}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        {row.isPaid ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                            ชำระแล้ว
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                            ค้างชำระ
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <Link
                            href={`/receipt?billId=${row.billId}&mode=invoice`}
                            className="rounded-xl bg-blue-50 px-3 py-2 text-center text-xs font-black text-blue-700"
                          >
                            ใบแจ้งหนี้
                          </Link>

                          <Link
                            href={`/receipt?billId=${row.billId}&mode=receipt`}
                            className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-black text-emerald-700"
                          >
                            ใบเสร็จ
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {filteredRows.length > 0 ? (
                <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-black">
                  <tr>
                    <td className="px-4 py-4" colSpan={5}>
                      รวมรายการที่แสดง
                    </td>

                    <td className="px-4 py-4 text-right">
                      {formatThaiNumber(
                        filteredRows.reduce(
                          (sum, row) => sum + row.calculation.usedUnits,
                          0
                        )
                      )}
                    </td>

                    <td className="px-4 py-4 text-right">
                      {formatThaiCurrency(
                        filteredRows.reduce(
                          (sum, row) => sum + row.calculation.waterAmount,
                          0
                        )
                      )}
                    </td>

                    <td className="px-4 py-4 text-right">
                      {formatThaiCurrency(
                        filteredRows.reduce(
                          (sum, row) => sum + row.calculation.serviceFee,
                          0
                        )
                      )}
                    </td>

                    <td className="px-4 py-4 text-right text-blue-700">
                      {formatThaiCurrency(
                        filteredRows.reduce(
                          (sum, row) => sum + row.calculation.totalAmount,
                          0
                        )
                      )}
                    </td>

                    <td className="px-4 py-4" colSpan={3} />
                  </tr>
                </tfoot>
              ) : null}
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
