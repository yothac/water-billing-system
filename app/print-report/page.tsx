"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  calculateWaterBillV4,
  formatThaiCurrency,
  formatThaiNumber,
  getBillingModeLabel,
  padMeterReading,
} from "../../lib/billing";
import { getUserServiceFee } from "../../lib/service-fee";
import { loadWaterAppData } from "../../lib/app-data-client";
import type {
  BillingMode,
  BillingPeriod,
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../../types/water-system";

type ReportPrintMode = "all" | "unpaid" | "paid";

interface PrintReportRow {
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

function getQueryMode(): ReportPrintMode {
  if (typeof window === "undefined") {
    return "all";
  }

  const mode = new URLSearchParams(window.location.search).get("mode");

  if (mode === "paid" || mode === "unpaid") {
    return mode;
  }

  return "all";
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

function sortRows(rows: PrintReportRow[]) {
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

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

function getPrintDateTime() {
  return new Date().toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PrintReportPage() {
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
  const [mode, setMode] = useState<ReportPrintMode>("all");

  async function refreshData() {
    const queryMode = getQueryMode();

    try {
      const data = await loadWaterAppData();

      setSettings(data.settings);
      setCurrentPeriod(data.currentPeriod);
      setUsers(data.users);
      setReadings(data.readings);
      setPayments(data.payments);
      setMode(queryMode);
    } catch (error) {
      console.error(error);
      setMode(queryMode);
    }
  }

  useEffect(() => {
    void refreshData();
  }, []);

  const rows = useMemo<PrintReportRow[]>(() => {
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

  const pages = useMemo(() => chunkRows(filteredRows, 24), [filteredRows]);

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

  const reportTitle =
    mode === "paid"
      ? "รายงานผู้ชำระเงินแล้ว"
      : mode === "unpaid"
        ? "รายงานผู้ค้างชำระ"
        : "รายงานสรุปค่าน้ำประปาประจำรอบบิล";

  return (
    <main className="min-h-screen bg-slate-200 py-4 print:bg-white print:p-0">
      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 0;
        }

        .a4-report-sheet {
          width: 297mm;
          height: 210mm;
          padding: 7mm;
          background: white;
          color: #0f172a;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9.2px;
          line-height: 1.18;
        }

        .report-table th {
          border: 0.25mm solid #334155;
          background: #e2e8f0;
          padding: 1.15mm 0.8mm;
          text-align: center;
          font-weight: 900;
          white-space: nowrap;
        }

        .report-table td {
          border: 0.25mm solid #64748b;
          padding: 1.05mm 0.8mm;
          vertical-align: middle;
        }

        .report-table tfoot td {
          background: #f1f5f9;
          font-weight: 900;
        }

        .summary-box {
          border: 0.25mm solid #334155;
          padding: 1.6mm 2mm;
          border-radius: 1.5mm;
        }

        @media print {
          html,
          body {
            width: 297mm;
            min-height: 210mm;
            background: #ffffff !important;
          }

          .no-print {
            display: none !important;
          }

          .a4-report-sheet {
            margin: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-after: always;
            transform: none !important;
            max-width: none !important;
          }

          .a4-report-sheet:last-child {
            page-break-after: auto;
          }
        }

        @media screen {
          .a4-report-sheet {
            margin-left: auto;
            margin-right: auto;
            margin-bottom: 16px;
            box-shadow: 0 14px 40px rgba(15, 23, 42, 0.22);
            border-radius: 14px;
          }

          @media (max-width: 1100px) {
            .a4-report-sheet {
              transform: scale(0.72);
              transform-origin: top center;
              margin-bottom: -56mm;
            }
          }

          @media (max-width: 780px) {
            .a4-report-sheet {
              transform: scale(0.48);
              transform-origin: top center;
              margin-bottom: -105mm;
            }
          }
        }
      `}</style>

      <section className="no-print mx-auto mb-4 flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4">
        <div>
          <Link href="/reports" className="text-sm font-black text-blue-700">
            ← กลับรายงาน
          </Link>

          <h1 className="mt-2 text-2xl font-black text-slate-900">
            พิมพ์รายงาน A4
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            {currentPeriod.periodName} · ตารางสรุปทั้งรอบบิล ·{" "}
            {filteredRows.length.toLocaleString("th-TH")} รายการ
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/print-report?mode=all"
            className={
              mode === "all"
                ? "rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow"
                : "rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-700 ring-1 ring-blue-200"
            }
          >
            ทั้งหมด
          </Link>

          <Link
            href="/print-report?mode=unpaid"
            className={
              mode === "unpaid"
                ? "rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white shadow"
                : "rounded-2xl bg-white px-4 py-3 text-sm font-black text-red-700 ring-1 ring-red-200"
            }
          >
            ค้างชำระ
          </Link>

          <Link
            href="/print-report?mode=paid"
            className={
              mode === "paid"
                ? "rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow"
                : "rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-700 ring-1 ring-emerald-200"
            }
          >
            ชำระแล้ว
          </Link>

          <button
            onClick={refreshData}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200"
          >
            รีเฟรช
          </button>

          <button
            onClick={() => window.print()}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow"
          >
            พิมพ์ A4
          </button>
        </div>
      </section>

      {pages.length === 0 ? (
        <section className="a4-report-sheet items-center justify-center text-center">
          <div>
            <div className="text-5xl">📊</div>
            <h2 className="mt-4 text-2xl font-black">ไม่มีข้อมูลรายงาน</h2>
            <p className="mt-2 text-slate-500">
              กรุณาจดมิเตอร์หรือเปลี่ยนตัวกรองรายงาน
            </p>
          </div>
        </section>
      ) : (
        pages.map((pageRows, pageIndex) => (
          <section key={`page-${pageIndex}`} className="a4-report-sheet">
            <header className="border-b border-slate-700 pb-[3mm]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[17px] font-black leading-tight">
                    {reportTitle}
                  </h2>

                  <p className="mt-1 text-[11px] font-bold">
                    {settings.villageName} · รอบบิล {currentPeriod.periodName}
                  </p>

                  <p className="mt-1 text-[9px] text-slate-600">
                    พิมพ์เมื่อ {getPrintDateTime()} · หน้า {pageIndex + 1} /{" "}
                    {pages.length}
                  </p>
                </div>

                <div className="grid min-w-[112mm] grid-cols-3 gap-[2mm] text-[9.5px]">
                  <div className="summary-box">
                    <p className="text-slate-500">จำนวนบิล</p>
                    <p className="text-[13px] font-black">
                      {formatThaiNumber(summary.totalBills)}
                    </p>
                  </div>

                  <div className="summary-box">
                    <p className="text-slate-500">ยอดรวม</p>
                    <p className="text-[13px] font-black">
                      {formatThaiCurrency(summary.totalAmount)}
                    </p>
                  </div>

                  <div className="summary-box">
                    <p className="text-slate-500">ค้างชำระ</p>
                    <p className="text-[13px] font-black">
                      {formatThaiCurrency(summary.unpaidAmount)}
                    </p>
                  </div>
                </div>
              </div>
            </header>

            <section className="mt-[3mm] grid grid-cols-6 gap-[2mm] text-[9.2px]">
              <div className="summary-box">
                <p className="text-slate-500">หน่วยรวม</p>
                <p className="font-black">{formatThaiNumber(summary.totalUnits)}</p>
              </div>

              <div className="summary-box">
                <p className="text-slate-500">ค่าน้ำ</p>
                <p className="font-black">
                  {formatThaiCurrency(summary.totalWaterAmount)}
                </p>
              </div>

              <div className="summary-box">
                <p className="text-slate-500">ค่าบริการ</p>
                <p className="font-black">
                  {formatThaiCurrency(summary.totalServiceFee)}
                </p>
              </div>

              <div className="summary-box">
                <p className="text-slate-500">รับแล้ว</p>
                <p className="font-black">{formatThaiCurrency(summary.paidAmount)}</p>
              </div>

              <div className="summary-box">
                <p className="text-slate-500">ชำระแล้ว</p>
                <p className="font-black">{formatThaiNumber(summary.paidBills)} ราย</p>
              </div>

              <div className="summary-box">
                <p className="text-slate-500">ค้าง</p>
                <p className="font-black">
                  {formatThaiNumber(summary.unpaidBills)} ราย
                </p>
              </div>
            </section>

            <div className="mt-[3mm] flex-grow overflow-hidden">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>ลำดับ</th>
                    <th>รหัส</th>
                    <th className="text-left">ชื่อผู้ใช้น้ำ</th>
                    <th>บ้าน/รหัส</th>
                    <th>ก่อน</th>
                    <th>หลัง</th>
                    <th>หน่วย</th>
                    <th>ค่าน้ำ</th>
                    <th>บริการ</th>
                    <th>รวม</th>
                    <th>ประเภท</th>
                    <th>สถานะ</th>
                    <th>ลงชื่อ</th>
                  </tr>
                </thead>

                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.billId}>
                      <td className="text-center">{row.no}</td>
                      <td className="text-center font-bold">
                        {row.user?.userCode || "-"}
                      </td>
                      <td className="font-bold">{row.user?.fullName || "-"}</td>
                      <td className="text-center">
                        {row.user?.address || row.user?.addressCode || "-"}
                      </td>
                      <td className="text-center">
                        {padMeterReading(row.previousReading)}
                      </td>
                      <td className="text-center">
                        {padMeterReading(row.currentReading)}
                      </td>
                      <td className="text-right font-bold">
                        {formatThaiNumber(row.usedUnits)}
                      </td>
                      <td className="text-right">
                        {formatThaiCurrency(row.waterAmount)}
                      </td>
                      <td className="text-right">
                        {formatThaiCurrency(row.serviceFee)}
                      </td>
                      <td className="text-right font-black">
                        {formatThaiCurrency(row.totalAmount)}
                      </td>
                      <td className="text-center text-[8.4px]">
                        {getBillingModeLabel(row.billingMode)}
                      </td>
                      <td className="text-center font-bold">
                        {row.isPaid ? "ชำระแล้ว" : "ค้างชำระ"}
                      </td>
                      <td className="min-w-[18mm]" />
                    </tr>
                  ))}
                </tbody>

                {pageIndex === pages.length - 1 ? (
                  <tfoot>
                    <tr>
                      <td colSpan={6} className="text-center">
                        รวมทั้งสิ้น
                      </td>
                      <td className="text-right">
                        {formatThaiNumber(summary.totalUnits)}
                      </td>
                      <td className="text-right">
                        {formatThaiCurrency(summary.totalWaterAmount)}
                      </td>
                      <td className="text-right">
                        {formatThaiCurrency(summary.totalServiceFee)}
                      </td>
                      <td className="text-right">
                        {formatThaiCurrency(summary.totalAmount)}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            <footer className="mt-[3mm] flex items-end justify-between text-[9px]">
              <p>
                หมายเหตุ: รายงานนี้คำนวณจาก Billing Core V4 และข้อมูลใน
                local-store
              </p>

              <div className="grid grid-cols-2 gap-[18mm] text-center">
                <div>
                  <div className="w-[38mm] border-b border-dotted border-slate-700 pb-[8mm]" />
                  <p className="mt-1 font-bold">ผู้จัดทำรายงาน</p>
                </div>

                <div>
                  <div className="w-[38mm] border-b border-dotted border-slate-700 pb-[8mm]" />
                  <p className="mt-1 font-bold">ผู้ตรวจสอบ</p>
                </div>
              </div>
            </footer>
          </section>
        ))
      )}
    </main>
  );
}
