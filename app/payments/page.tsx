"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  calculateWaterBillV4,
  formatThaiCurrency,
  formatThaiNumber,
  makeReceiptNo,
  padMeterReading,
} from "../../lib/billing";
import { getUserServiceFee } from "../../lib/service-fee";
import {
  getStoredCurrentPeriod,
  getStoredMeterReadings,
  getStoredPayments,
  getStoredSettings,
  getStoredWaterUsers,
  upsertStoredPayment,
} from "../../lib/local-store";
import {
  getDataSourceMode,
  getDataSourceModeLabel,
  type DataSourceMode,
} from "../../lib/data-source";
import type {
  BillCalculation,
  BillingMode,
  BillingPeriod,
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../../types/water-system";

type PaymentFilter = "all" | "unpaid" | "paid";
type PaymentMethod = "cash" | "transfer" | "other";

interface PaymentRow {
  billId: string;
  reading: MeterReading;
  user?: WaterUser;
  payment?: Payment;
  calculation: BillCalculation;
  isPaid: boolean;
}

interface MeterDataApiResponse {
  ok: boolean;
  message?: string;
  error?: string;
  settings?: WaterSettings;
  currentPeriod?: BillingPeriod;
  users?: WaterUser[];
  readings?: MeterReading[];
}

interface PaymentsApiResponse {
  ok: boolean;
  message?: string;
  error?: string;
  payments?: Payment[];
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

function sortRows(rows: PaymentRow[]) {
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

export default function PaymentsPage() {
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
  const [dataSourceMode, setDataSourceMode] =
    useState<DataSourceMode>("localStorage");
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<PaymentFilter>("unpaid");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("รับเงินสด");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadSupabasePaymentData() {
    setIsLoadingData(true);

    try {
      const [meterResponse, paymentsResponse] = await Promise.all([
        fetch("/api/meter-readings", { cache: "no-store" }),
        fetch("/api/payments", { cache: "no-store" }),
      ]);

      const meterData = (await meterResponse.json()) as MeterDataApiResponse;
      const paymentsData =
        (await paymentsResponse.json()) as PaymentsApiResponse;

      if (!meterResponse.ok || !meterData.ok) {
        showError(
          meterData.error ||
            meterData.message ||
            "โหลดข้อมูลจดมิเตอร์จาก Supabase ไม่สำเร็จ"
        );
        return;
      }

      if (!paymentsResponse.ok || !paymentsData.ok) {
        showError(
          paymentsData.error ||
            paymentsData.message ||
            "โหลดข้อมูลรับชำระจาก Supabase ไม่สำเร็จ"
        );
        return;
      }

      setSettings(meterData.settings || getStoredSettings());
      setCurrentPeriod(meterData.currentPeriod || getStoredCurrentPeriod());
      setUsers(meterData.users || []);
      setReadings(meterData.readings || []);
      setPayments(paymentsData.payments || []);
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "โหลดข้อมูลจาก Supabase ไม่สำเร็จ"
      );
    } finally {
      setIsLoadingData(false);
    }
  }

  function refreshLocalData() {
    setSettings(getStoredSettings());
    setCurrentPeriod(getStoredCurrentPeriod());
    setUsers(getStoredWaterUsers());
    setReadings(getStoredMeterReadings());
    setPayments(getStoredPayments());
  }

  function refreshData() {
    if (dataSourceMode === "supabase") {
      void loadSupabasePaymentData();
      return;
    }

    refreshLocalData();
  }

  useEffect(() => {
    const mode = getDataSourceMode();

    setDataSourceMode(mode);

    if (mode === "supabase") {
      void loadSupabasePaymentData();
      return;
    }

    refreshLocalData();
  }, []);

  const rows = useMemo<PaymentRow[]>(() => {
    const currentPeriodReadings = readings.filter(
      (reading) => reading.periodId === currentPeriod.id
    );

    const builtRows = currentPeriodReadings.map((reading) => {
      const user = users.find((item) => item.id === reading.waterUserId);
      const billId = makeBillId(reading.periodId, reading.waterUserId);

      const payment = payments.find(
        (item) => item.billId === billId && item.status !== "cancelled"
      );

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

  const isPeriodLocked = currentPeriod.status === "locked";

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
            row.billId,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query);

      const matchFilter =
        filter === "all" ? true : filter === "paid" ? row.isPaid : !row.isPaid;

      return matchKeyword && matchFilter;
    });
  }, [rows, keyword, filter]);

  const summary = useMemo(() => {
    const totalBills = rows.length;
    const paidBills = rows.filter((row) => row.isPaid).length;
    const unpaidBills = totalBills - paidBills;

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
      totalAmount,
      paidAmount,
      unpaidAmount,
    };
  }, [rows]);

  function showMessage(text: string) {
    setMessage(text);
    setError("");
    window.setTimeout(() => setMessage(""), 2500);
  }

  function showError(text: string) {
    setError(text);
    setMessage("");
  }

  async function handlePay(row: PaymentRow) {
    if (isPeriodLocked) {
      showError("รอบบิลนี้ถูกล็อกแล้ว ไม่สามารถรับชำระเงินได้");
      return;
    }

    if (!row.user) {
      showError("ไม่พบข้อมูลผู้ใช้น้ำของบิลนี้");
      return;
    }

    const now = new Date().toISOString();

    const runningNumber =
      rows.findIndex((item) => item.billId === row.billId) + 1;

    const payment: Payment = {
      id: `payment-${row.billId}`,
      billId: row.billId,
      periodId: row.reading.periodId,
      waterUserId: row.reading.waterUserId,
      readingId: row.reading.id,
      amount: row.calculation.totalAmount,
      paymentMethod,
      paidAt: now,
      receiptNo: makeReceiptNo({
        periodYear: currentPeriod.year || new Date().getFullYear(),
        periodMonth: currentPeriod.month || new Date().getMonth() + 1,
        runningNumber: runningNumber > 0 ? runningNumber : 1,
        prefix: settings.receiptPrefix || "WR",
      }),
      receiptBookNo: settings.receiptBookNo,
      status: "paid",
      note,
      createdAt: row.payment?.createdAt || now,
      updatedAt: now,
      cancelledAt: null,
    };

    if (dataSourceMode === "supabase") {
      try {
        const response = await fetch("/api/payments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payment),
        });

        const data = (await response.json()) as PaymentsApiResponse;

        if (!response.ok || !data.ok) {
          showError(
            data.error || data.message || "บันทึกรับชำระเข้า Supabase ไม่สำเร็จ"
          );
          return;
        }

        setPayments(data.payments || payments);
        showMessage(`รับชำระ ${row.user.fullName} สำเร็จ`);
        return;
      } catch (error) {
        showError(
          error instanceof Error
            ? error.message
            : "บันทึกรับชำระเข้า Supabase ไม่สำเร็จ"
        );
        return;
      }
    }

    const nextPayments = upsertStoredPayment(payment);

    setPayments(nextPayments);
    showMessage(`รับชำระ ${row.user.fullName} สำเร็จ`);
  }

  async function handleCancelPayment(row: PaymentRow) {
    if (isPeriodLocked) {
      showError("รอบบิลนี้ถูกล็อกแล้ว ไม่สามารถยกเลิกการรับชำระได้");
      return;
    }

    if (!row.payment) {
      showError("ยังไม่มีรายการชำระเงินให้ยกเลิก");
      return;
    }

    const now = new Date().toISOString();

    const cancelledPayment: Payment = {
      ...row.payment,
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
      note: row.payment.note
        ? `${row.payment.note} / ยกเลิกการรับชำระ`
        : "ยกเลิกการรับชำระ",
    };

    if (dataSourceMode === "supabase") {
      try {
        const response = await fetch("/api/payments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(cancelledPayment),
        });

        const data = (await response.json()) as PaymentsApiResponse;

        if (!response.ok || !data.ok) {
          showError(
            data.error ||
              data.message ||
              "ยกเลิกรับชำระใน Supabase ไม่สำเร็จ"
          );
          return;
        }

        setPayments(data.payments || payments);
        showMessage("ยกเลิกการรับชำระแล้ว");
        return;
      } catch (error) {
        showError(
          error instanceof Error
            ? error.message
            : "ยกเลิกรับชำระใน Supabase ไม่สำเร็จ"
        );
        return;
      }
    }

    const nextPayments = upsertStoredPayment(cancelledPayment);

    setPayments(nextPayments);
    showMessage("ยกเลิกการรับชำระแล้ว");
  }

  const filterButtons: Array<{
    value: PaymentFilter;
    label: string;
  }> = [
    { value: "unpaid", label: "ค้างชำระ" },
    { value: "paid", label: "ชำระแล้ว" },
    { value: "all", label: "ทั้งหมด" },
  ];

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-700 via-blue-700 to-cyan-600 px-4 pb-24 pt-5 text-white">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-white/10" />

        <div className="relative mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/" className="text-sm font-bold text-blue-100">
                ← กลับหน้าหลัก
              </Link>

              <h1 className="mt-5 text-3xl font-black tracking-tight">
                รับชำระค่าน้ำ
              </h1>

              <p className="mt-1 text-sm text-blue-100">
                {currentPeriod.periodName} · {getDataSourceModeLabel(dataSourceMode)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/reports"
                className="rounded-2xl border border-white/30 bg-white/15 px-4 py-3 text-sm font-black text-white shadow-sm backdrop-blur"
              >
                รายงาน
              </Link>

              <Link
                href="/backup"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-700 shadow-sm"
              >
                Backup
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">ยอดรวม</p>
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

        {isPeriodLocked ? (
          <div className="mb-4 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-black text-red-700">
                  รอบบิลนี้ถูกล็อกแล้ว
                </p>
                <p className="mt-1 text-sm font-bold text-red-600">
                  ไม่สามารถรับชำระหรือยกเลิกชำระได้ จนกว่าจะเปิดรอบเพื่อแก้ไข
                </p>
              </div>

              <Link
                href="/period-control"
                className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white"
              >
                เปิดควบคุมรอบบิล
              </Link>
            </div>
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-500">บิลทั้งหมด</p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {formatThaiNumber(summary.totalBills)}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-500">ชำระแล้ว</p>
            <p className="mt-1 text-2xl font-black text-emerald-700">
              {formatThaiNumber(summary.paidBills)}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-500">ค้างชำระ</p>
            <p className="mt-1 text-2xl font-black text-red-700">
              {formatThaiNumber(summary.unpaidBills)}
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
            <div>
              <label className="text-sm font-black text-slate-700">
                ค้นหา
              </label>

              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="ค้นหา รหัส / ชื่อ / บ้าน / หมู่"
                className="mt-2 w-full rounded-2xl border border-slate-200 px-5 py-4 text-lg outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-sm font-black text-slate-700">
                วิธีชำระ
              </label>

              <select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as PaymentMethod)
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 font-black outline-none focus:border-blue-500"
              >
                <option value="cash">เงินสด</option>
                <option value="transfer">โอนเงิน</option>
                <option value="other">อื่น ๆ</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-black text-slate-700">
                หมายเหตุรับเงิน
              </label>

              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="รับเงินสด"
                className="mt-2 w-full rounded-2xl border border-slate-200 px-5 py-4 font-bold outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={refreshData}
              disabled={isLoadingData}
              className={
                isLoadingData
                  ? "rounded-2xl bg-slate-300 px-5 py-4 font-black text-white"
                  : "rounded-2xl bg-slate-900 px-5 py-4 font-black text-white shadow"
              }
            >
              {isLoadingData ? "กำลังโหลด..." : "รีเฟรช"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {filterButtons.map((button) => (
              <button
                key={button.value}
                onClick={() => setFilter(button.value)}
                className={
                  filter === button.value
                    ? "rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow"
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
                รายการรับชำระ
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                แสดง {formatThaiNumber(filteredRows.length)} จาก{" "}
                {formatThaiNumber(rows.length)} รายการ
              </p>
            </div>

            <Link
              href="/meter-reading"
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow"
            >
              ไปจดมิเตอร์
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อผู้ใช้น้ำ</th>
                  <th className="px-4 py-3">บ้าน/รหัส</th>
                  <th className="px-4 py-3 text-right">ก่อน</th>
                  <th className="px-4 py-3 text-right">หลัง</th>
                  <th className="px-4 py-3 text-right">หน่วย</th>
                  <th className="px-4 py-3 text-right">ยอดเงิน</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">รับชำระ</th>
                  <th className="px-4 py-3">เอกสาร</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      ไม่พบข้อมูลรับชำระ
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

                        {row.payment ? (
                          <p className="mt-1 text-xs text-slate-500">
                            รับเมื่อ {getThaiDateTime(row.payment.paidAt)}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500">
                            billId: {row.billId}
                          </p>
                        )}
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

                      <td className="px-4 py-3 text-right text-base font-black text-blue-700">
                        {formatThaiCurrency(row.calculation.totalAmount)}
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
                        {row.isPaid ? (
                          <button
                            onClick={() => void handleCancelPayment(row)}
                            disabled={isPeriodLocked}
                            className={
                              isPeriodLocked
                                ? "rounded-xl bg-slate-100 px-4 py-3 text-xs font-black text-slate-400"
                                : "rounded-xl bg-red-50 px-4 py-3 text-xs font-black text-red-700"
                            }
                          >
                            {isPeriodLocked ? "ล็อกแล้ว" : "ยกเลิกชำระ"}
                          </button>
                        ) : (
                          <button
                            onClick={() => void handlePay(row)}
                            disabled={isPeriodLocked}
                            className={
                              isPeriodLocked
                                ? "rounded-xl bg-slate-300 px-4 py-3 text-xs font-black text-white"
                                : "rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white shadow"
                            }
                          >
                            {isPeriodLocked ? "ล็อกแล้ว" : "รับเงินเต็มจำนวน"}
                          </button>
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
                    <td className="px-4 py-4" colSpan={6}>
                      รวมรายการที่แสดง
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
            className="rounded-2xl bg-blue-50 px-2 py-2 font-black text-blue-700"
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
