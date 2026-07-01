"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  calculateWaterBillV4,
  formatThaiCurrency,
  getBillingModeLabel,
  padMeterReading,
} from "../../lib/billing";
import { getUserServiceFee } from "../../lib/service-fee";
import {
  exportCurrentWaterAppData,
  loadWaterAppData,
} from "../../lib/app-data-client";
import type {
  BillingMode,
  BillingPeriod,
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../../types/water-system";

type ExportMode = "all" | "unpaid" | "paid";

interface ExportRow {
  no: number;
  billId: string;
  reading: MeterReading;
  user?: WaterUser;
  payment?: Payment;
  isPaid: boolean;
  billingMode: BillingMode;
  previousReading: number;
  currentReading: number;
  usedUnits: number;
  unitPrice: number;
  waterAmount: number;
  serviceFee: number;
  totalAmount: number;
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

function sortRows(rows: ExportRow[]) {
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

function getFileDateText() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  return `${year}${month}${day}-${hour}${minute}`;
}

function escapeCsv(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function makeCsv(headers: string[], rows: Array<Array<unknown>>) {
  const csvLines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ];

  return "\uFEFF" + csvLines.join("\r\n");
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

function getThaiDateTime(value?: string | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ExportsPage() {
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

  const [mode, setMode] = useState<ExportMode>("all");
  const [message, setMessage] = useState("");

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

  const rows = useMemo<ExportRow[]>(() => {
    const periodReadings = readings.filter(
      (reading) => reading.periodId === currentPeriod.id
    );

    const builtRows = periodReadings.map((reading, index) => {
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
        no: index + 1,
        billId,
        reading,
        user,
        payment,
        isPaid: Boolean(payment),
        billingMode: calculation.billingMode,
        previousReading: calculation.previousReading,
        currentReading: calculation.currentReading,
        usedUnits: calculation.usedUnits,
        unitPrice: calculation.unitPrice,
        waterAmount: calculation.waterAmount,
        serviceFee: calculation.serviceFee,
        totalAmount: calculation.totalAmount,
      };
    });

    return sortRows(builtRows).map((row, index) => ({
      ...row,
      no: index + 1,
    }));
  }, [readings, currentPeriod.id, users, payments, settings]);

  const filteredRows = useMemo(() => {
    if (mode === "paid") {
      return rows.filter((row) => row.isPaid);
    }

    if (mode === "unpaid") {
      return rows.filter((row) => !row.isPaid);
    }

    return rows;
  }, [rows, mode]);

  const summary = useMemo(() => {
    const totalBills = filteredRows.length;
    const paidBills = filteredRows.filter((row) => row.isPaid).length;
    const unpaidBills = totalBills - paidBills;

    const totalUnits = filteredRows.reduce((sum, row) => sum + row.usedUnits, 0);
    const totalWaterAmount = filteredRows.reduce(
      (sum, row) => sum + row.waterAmount,
      0
    );
    const totalServiceFee = filteredRows.reduce(
      (sum, row) => sum + row.serviceFee,
      0
    );
    const totalAmount = filteredRows.reduce(
      (sum, row) => sum + row.totalAmount,
      0
    );
    const paidAmount = filteredRows.reduce(
      (sum, row) => sum + (row.isPaid ? row.totalAmount : 0),
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
    };
  }, [filteredRows]);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

  function handleExportReportCsv() {
    const headers = [
      "ลำดับ",
      "รอบบิล",
      "Bill ID",
      "รหัสผู้ใช้น้ำ",
      "ชื่อผู้ใช้น้ำ",
      "บ้าน/รหัส",
      "หมู่",
      "เลขครั้งก่อน",
      "เลขครั้งนี้",
      "หน่วยที่ใช้",
      "หน่วยละ",
      "ค่าน้ำ",
      "ค่าบริการ",
      "รวมเงิน",
      "ประเภทบิล",
      "สถานะชำระ",
      "วันที่จด",
      "วันที่ชำระ",
      "เลขที่ใบเสร็จ",
      "หมายเหตุจดมิเตอร์",
      "หมายเหตุรับเงิน",
    ];

    const csvRows = filteredRows.map((row) => [
      row.no,
      currentPeriod.periodName,
      row.billId,
      row.user?.userCode || "",
      row.user?.fullName || "",
      row.user?.address || row.user?.addressCode || "",
      row.user?.villageNo || "",
      padMeterReading(row.previousReading),
      padMeterReading(row.currentReading),
      row.usedUnits,
      row.unitPrice,
      row.waterAmount,
      row.serviceFee,
      row.totalAmount,
      getBillingModeLabel(row.billingMode),
      row.isPaid ? "ชำระแล้ว" : "ค้างชำระ",
      getThaiDateTime(row.reading.recordedAt),
      getThaiDateTime(row.payment?.paidAt),
      row.payment?.receiptNo || "",
      row.reading.note || "",
      row.payment?.note || "",
    ]);

    const modeText =
      mode === "paid" ? "paid" : mode === "unpaid" ? "unpaid" : "all";

    const filename = `water-report-${currentPeriod.id}-${modeText}-${getFileDateText()}.csv`;

    downloadTextFile(filename, makeCsv(headers, csvRows), "text/csv");
    showMessage("ส่งออก CSV รายงานแล้ว");
  }

  function handleExportUsersCsv() {
    const headers = [
      "id",
      "userCode",
      "fullName",
      "address",
      "addressCode",
      "villageNo",
      "phone",
      "status",
      "userStatus",
      "defaultBillingMode",
      "serviceOnly",
      "cutMeter",
      "serviceFeeOverride",
      "lastReading",
      "lastReadingText",
      "lastRecordDateLabel",
      "note",
    ];

    const csvRows = users.map((user) => [
      user.id,
      user.userCode,
      user.fullName,
      user.address,
      user.addressCode || "",
      user.villageNo,
      user.phone || "",
      user.status,
      user.userStatus || "",
      user.defaultBillingMode || "",
      user.serviceOnly ? "TRUE" : "FALSE",
      user.cutMeter ? "TRUE" : "FALSE",
      user.serviceFeeOverride ?? "",
      user.lastReading,
      user.lastReadingText || "",
      user.lastRecordDateLabel || "",
      user.note || "",
    ]);

    const filename = `water-users-${getFileDateText()}.csv`;

    downloadTextFile(filename, makeCsv(headers, csvRows), "text/csv");
    showMessage("ส่งออก CSV ผู้ใช้น้ำแล้ว");
  }

  function handleExportPaymentsCsv() {
    const headers = [
      "id",
      "billId",
      "periodId",
      "waterUserId",
      "readingId",
      "amount",
      "paymentMethod",
      "paidAt",
      "receiptNo",
      "receiptBookNo",
      "status",
      "note",
      "createdAt",
      "updatedAt",
      "cancelledAt",
    ];

    const csvRows = payments.map((payment) => [
      payment.id,
      payment.billId,
      payment.periodId || "",
      payment.waterUserId || "",
      payment.readingId || "",
      payment.amount,
      payment.paymentMethod || "",
      payment.paidAt,
      payment.receiptNo || "",
      payment.receiptBookNo || "",
      payment.status || "paid",
      payment.note || "",
      payment.createdAt || "",
      payment.updatedAt || "",
      payment.cancelledAt || "",
    ]);

    const filename = `water-payments-${getFileDateText()}.csv`;

    downloadTextFile(filename, makeCsv(headers, csvRows), "text/csv");
    showMessage("ส่งออก CSV รับชำระแล้ว");
  }

  async function handleExportBackupJson() {
    const data = await exportCurrentWaterAppData();
    const filename = `water-billing-backup-${getFileDateText()}.json`;

    downloadTextFile(
      filename,
      JSON.stringify(data, null, 2),
      "application/json"
    );

    showMessage("ส่งออก Backup JSON แล้ว");
  }

  const modeButtons: Array<{
    value: ExportMode;
    label: string;
  }> = [
    { value: "all", label: "ทั้งหมด" },
    { value: "unpaid", label: "ค้างชำระ" },
    { value: "paid", label: "ชำระแล้ว" },
  ];

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
                ส่งออกข้อมูล
              </h1>

              <p className="mt-1 text-sm text-blue-100">
                CSV / JSON · ใช้ข้อมูลจาก local-store และ Billing Core V4
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
                href="/reports"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-700 shadow-sm"
              >
                รายงาน
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur">
              <p className="text-sm text-blue-100">จำนวนบิล</p>
              <p className="mt-1 text-3xl font-black">
                {summary.totalBills.toLocaleString("th-TH")}
              </p>
            </div>

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
          </div>
        </div>
      </section>

      <section className="relative mx-auto -mt-16 max-w-7xl px-4">
        {message ? (
          <div className="mb-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center font-black text-emerald-700 shadow-sm">
            {message}
          </div>
        ) : null}

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                ส่งออกรายงานรอบบิล
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {currentPeriod.periodName} · เลือกกลุ่มข้อมูลก่อนดาวน์โหลด CSV
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {modeButtons.map((button) => (
                <button
                  key={button.value}
                  onClick={() => setMode(button.value)}
                  className={
                    mode === button.value
                      ? "rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow"
                      : "rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-600 ring-1 ring-slate-200"
                  }
                >
                  {button.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-700">รายการที่เลือก</p>
              <p className="mt-1 text-2xl font-black text-blue-900">
                {summary.totalBills.toLocaleString("th-TH")} รายการ
              </p>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-sm font-bold text-emerald-700">ชำระแล้ว</p>
              <p className="mt-1 text-2xl font-black text-emerald-900">
                {summary.paidBills.toLocaleString("th-TH")} รายการ
              </p>
            </div>

            <div className="rounded-3xl border border-red-100 bg-red-50 p-4">
              <p className="text-sm font-bold text-red-700">ค้างชำระ</p>
              <p className="mt-1 text-2xl font-black text-red-900">
                {summary.unpaidBills.toLocaleString("th-TH")} รายการ
              </p>
            </div>
          </div>

          <button
            onClick={handleExportReportCsv}
            className="mt-5 w-full rounded-3xl bg-blue-600 px-5 py-5 text-lg font-black text-white shadow"
          >
            ดาวน์โหลด CSV รายงานตามตัวกรอง
          </button>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black text-slate-900">
              CSV ผู้ใช้น้ำ
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              ส่งออก users ทั้งหมด {users.length.toLocaleString("th-TH")} ราย
            </p>

            <button
              onClick={handleExportUsersCsv}
              className="mt-5 w-full rounded-3xl bg-emerald-600 px-5 py-5 text-lg font-black text-white shadow"
            >
              ดาวน์โหลด Users CSV
            </button>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black text-slate-900">
              CSV รับชำระ
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              ส่งออก payments ทั้งหมด{" "}
              {payments.length.toLocaleString("th-TH")} รายการ
            </p>

            <button
              onClick={handleExportPaymentsCsv}
              className="mt-5 w-full rounded-3xl bg-orange-600 px-5 py-5 text-lg font-black text-white shadow"
            >
              ดาวน์โหลด Payments CSV
            </button>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black text-slate-900">
              Backup JSON
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              ส่งออกข้อมูลทั้งหมดแบบ restore กลับได้
            </p>

            <button
              onClick={handleExportBackupJson}
              className="mt-5 w-full rounded-3xl bg-slate-900 px-5 py-5 text-lg font-black text-white shadow"
            >
              ดาวน์โหลด Backup JSON
            </button>
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                ตัวอย่างข้อมูลที่จะส่งออก
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                แสดง 20 รายการแรกจากตัวกรองปัจจุบัน
              </p>
            </div>

            <Link
              href="/print-report"
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow"
            >
              พิมพ์รายงาน A4
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">ลำดับ</th>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3">บ้าน/รหัส</th>
                  <th className="px-4 py-3 text-right">หน่วย</th>
                  <th className="px-4 py-3 text-right">รวมเงิน</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.slice(0, 20).map((row) => (
                  <tr key={row.billId} className="border-t border-slate-100">
                    <td className="px-4 py-3">{row.no}</td>
                    <td className="px-4 py-3 font-black">
                      {row.user?.userCode || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {row.user?.fullName || "ไม่พบผู้ใช้น้ำ"}
                    </td>
                    <td className="px-4 py-3">
                      {row.user?.address || row.user?.addressCode || "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-black">
                      {row.usedUnits.toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-blue-700">
                      {formatThaiCurrency(row.totalAmount)}
                    </td>
                    <td className="px-4 py-3">
                      {getBillingModeLabel(row.billingMode)}
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
                  </tr>
                ))}

                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      ไม่มีข้อมูลตามตัวกรองนี้
                    </td>
                  </tr>
                ) : null}
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
            href="/reports"
            className="rounded-2xl px-2 py-2 font-bold text-slate-500"
          >
            <div className="text-lg">📊</div>
            รายงาน
          </Link>

          <Link
            href="/exports"
            className="rounded-2xl bg-blue-50 px-2 py-2 font-black text-blue-700"
          >
            <div className="text-lg">⬇️</div>
            ส่งออก
          </Link>

          <Link
            href="/backup"
            className="rounded-2xl px-2 py-2 font-bold text-slate-500"
          >
            <div className="text-lg">💾</div>
            Backup
          </Link>
        </div>
      </nav>
    </main>
  );
}
