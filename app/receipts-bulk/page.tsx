"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  calculateWaterBillV4,
  formatThaiCurrency,
  getBillingModeLabel,
  makeReceiptNo,
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

type ReceiptMode = "invoice" | "receipt";

const THAI_MONTHS = [
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

interface BulkReceiptRow {
  billId: string;
  reading: MeterReading;
  user: WaterUser;
  payment?: Payment;
  receiptNo: string;
  calculation: {
    billingMode: BillingMode;
    previousReading: number;
    currentReading: number;
    usedUnits: number;
    unitPrice: number;
    waterAmount: number;
    serviceFee: number;
    totalAmount: number;
  };
}

function makeBillId(periodId: string, waterUserId: string) {
  return `bill-${periodId}-${waterUserId}`;
}

function getQueryMode(): ReceiptMode {
  if (typeof window === "undefined") {
    return "invoice";
  }

  const mode = new URLSearchParams(window.location.search).get("mode");

  return mode === "receipt" ? "receipt" : "invoice";
}

function toThaiYear(year: number) {
  return year > 2400 ? year : year + 543;
}

function getThaiDateParts(fallbackDay?: number | null) {
  const now = new Date();

  return {
    day: fallbackDay || now.getDate(),
    month: now.toLocaleDateString("th-TH", { month: "long" }),
    year: now.getFullYear() + 543,
  };
}

function getPeriodParts(period: BillingPeriod) {
  if (period.month && period.year) {
    return {
      month: THAI_MONTHS[Number(period.month) - 1] || "-",
      year: toThaiYear(Number(period.year)),
    };
  }

  const match = period.id.match(/period-(\d{4})-(\d{2})/);

  if (match) {
    return {
      month: THAI_MONTHS[Number(match[2]) - 1] || "-",
      year: toThaiYear(Number(match[1])),
    };
  }

  const parts = String(period.periodName || "").split(" ");

  return {
    month: parts[0] || "-",
    year: parts[1] || "-",
  };
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

function sortRows(rows: BulkReceiptRow[]) {
  return [...rows].sort((a, b) => {
    const addressA = String(a.user.address || a.user.addressCode || "");
    const addressB = String(b.user.address || b.user.addressCode || "");

    return (
      addressA.localeCompare(addressB, "th-TH", { numeric: true }) ||
      String(a.user.userCode || "").localeCompare(
        String(b.user.userCode || ""),
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

export default function ReceiptsBulkPage() {
  const [settings, setSettings] = useState<WaterSettings>({
    villageName: "ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน",
    unitPrice: 8,
    serviceFee: 20,
    meterMaxValue: 9999,
    receiptPrefix: "WR",
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
  const [mode, setMode] = useState<ReceiptMode>("invoice");

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

  const rows = useMemo(() => {
    const periodReadings = readings.filter(
      (reading) => reading.periodId === currentPeriod.id
    );

    const builtRows = periodReadings.flatMap((reading, index): BulkReceiptRow[] => {
      const user = users.find((item) => item.id === reading.waterUserId);

      if (!user) {
        return [];
      }

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

      const receiptNo =
        payment?.receiptNo ||
        makeReceiptNo({
          periodYear: currentPeriod.year || new Date().getFullYear(),
          periodMonth: currentPeriod.month || new Date().getMonth() + 1,
          runningNumber: index + 1,
          prefix: settings.receiptPrefix || "WR",
        });

      const row: BulkReceiptRow = {
        billId,
        reading,
        user,
        payment,
        receiptNo,
        calculation,
      };

      return [row];
    });

    return sortRows(builtRows);
  }, [readings, currentPeriod, users, payments, settings]);

  const pages = useMemo(() => chunkRows(rows, 6), [rows]);

  const dateParts = useMemo(
    () => getThaiDateParts(settings.defaultReceiptDay || null),
    [settings.defaultReceiptDay]
  );

  const periodParts = useMemo(
    () => getPeriodParts(currentPeriod),
    [currentPeriod]
  );

  const documentTitle =
    mode === "receipt"
      ? "ใบเสร็จรับเงินค่าน้ำประปา"
      : "ใบแจ้งหนี้ค่าน้ำประปา";

  const villageLine =
    settings.receiptVillageLine?.trim() ||
    settings.villageName ||
    "ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน";

  return (
    <main className="min-h-screen bg-slate-200 py-4 print:bg-white print:p-0">
      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 0;
        }

        .a4-sheet {
          width: 297mm;
          height: 210mm;
          padding: 5.5mm;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr 1fr;
          background: white;
        }

        .receipt-cell {
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          border: 0.28mm dashed #334155;
          padding: 3.2mm;
          font-size: 9.7px;
          line-height: 1.18;
          color: #0f172a;
          break-inside: avoid;
        }

        .receipt-title {
          font-size: 11.5px;
          line-height: 1.1;
        }

        .receipt-village {
          font-size: 10.5px;
          line-height: 1.1;
        }

        .receipt-name {
          font-size: 11.5px;
          line-height: 1.1;
        }

        .receipt-table th,
        .receipt-table td {
          border: 0.25mm solid #334155;
          padding: 1.25mm 0.8mm;
          text-align: center;
          vertical-align: middle;
        }

        .receipt-total {
          font-size: 11.5px;
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

          .a4-sheet {
            margin: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-after: always;
            transform: none !important;
            max-width: none !important;
          }

          .a4-sheet:last-child {
            page-break-after: auto;
          }
        }

        @media screen {
          .a4-sheet {
            margin-left: auto;
            margin-right: auto;
            box-shadow: 0 14px 40px rgba(15, 23, 42, 0.22);
            border-radius: 14px;
            overflow: hidden;
          }

          @media (max-width: 1100px) {
            .a4-sheet {
              transform: scale(0.72);
              transform-origin: top center;
              margin-bottom: -56mm;
            }
          }

          @media (max-width: 780px) {
            .a4-sheet {
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
            ใบเสร็จรวม 6 ใบ / A4
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            {currentPeriod.periodName} · จำนวน{" "}
            {rows.length.toLocaleString("th-TH")} ใบ · จัดพิมพ์พอดี A4 จริง
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/receipts-bulk?mode=invoice"
            className={
              mode === "invoice"
                ? "rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow"
                : "rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-700 ring-1 ring-blue-200"
            }
          >
            ใบแจ้งหนี้รวม
          </Link>

          <Link
            href="/receipts-bulk?mode=receipt"
            className={
              mode === "receipt"
                ? "rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow"
                : "rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-700 ring-1 ring-emerald-200"
            }
          >
            ใบเสร็จรวม
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
        <section className="mx-auto flex h-[210mm] w-[297mm] max-w-[calc(100vw-24px)] items-center justify-center rounded-2xl bg-white p-10 text-center shadow print:shadow-none">
          <div>
            <div className="text-5xl">📄</div>
            <h2 className="mt-4 text-2xl font-black text-slate-900">
              ยังไม่มีรายการจดมิเตอร์ในรอบนี้
            </h2>
            <p className="mt-2 text-slate-500">
              กรุณาจดมิเตอร์ก่อน แล้วกลับมาพิมพ์ใบเสร็จรวม
            </p>
          </div>
        </section>
      ) : (
        pages.map((pageRows, pageIndex) => (
          <section key={`page-${pageIndex}`} className="a4-sheet mb-4">
            {Array.from({ length: 6 }).map((_, cellIndex) => {
              const row = pageRows[cellIndex];

              if (!row) {
                return (
                  <div
                    key={`blank-${cellIndex}`}
                    className="receipt-cell bg-white"
                  />
                );
              }

              return (
                <article key={row.billId} className="receipt-cell flex flex-col">
                  <header className="space-y-[2px] border-b border-dashed border-slate-500 pb-[3px]">
                    <div className="flex items-baseline gap-1">
                      <span>เล่มที่</span>
                      <span className="min-w-10 flex-1 border-b border-dotted border-slate-600 px-1 font-bold">
                        {settings.receiptBookNo || "......."}
                      </span>

                      <span className="ml-auto font-black">เลขที่</span>
                      <span className="min-w-20 border-b border-dotted border-slate-600 px-1 text-center font-black">
                        {row.receiptNo}
                      </span>
                    </div>

                    <p className="receipt-title text-center font-black">
                      {documentTitle}
                    </p>

                    <p className="receipt-village truncate text-center font-bold">
                      {villageLine}
                    </p>

                    <div className="flex items-baseline gap-1">
                      <span>วันที่</span>
                      <span className="min-w-7 border-b border-dotted border-slate-600 px-1 text-center font-bold">
                        {dateParts.day}
                      </span>
                      <span>เดือน</span>
                      <span className="min-w-16 border-b border-dotted border-slate-600 px-1 text-center font-bold">
                        {dateParts.month}
                      </span>
                      <span>พ.ศ.</span>
                      <span className="min-w-10 border-b border-dotted border-slate-600 px-1 text-center font-bold">
                        {dateParts.year}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span>ชื่อ</span>
                      <span className="receipt-name min-w-0 flex-1 truncate border-b border-dotted border-slate-600 px-1 font-black">
                        {row.user.fullName}
                      </span>
                      <span>รหัส</span>
                      <span className="min-w-12 border-b border-dotted border-slate-600 px-1 text-center font-bold">
                        {row.user.userCode}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span>บ้าน/รหัส</span>
                      <span className="min-w-16 flex-1 truncate border-b border-dotted border-slate-600 px-1 font-bold">
                        {row.user.address || "-"}
                      </span>
                      <span>รอบ</span>
                      <span className="min-w-24 border-b border-dotted border-slate-600 px-1 text-center font-bold">
                        {periodParts.month} {periodParts.year}
                      </span>
                    </div>
                  </header>

                  <div className="mt-[4px] flex-grow">
                    <table className="receipt-table w-full border-collapse">
                      <thead>
                        <tr>
                          <th>หน่วยละ</th>
                          <th>ค่าบริการ</th>
                          <th>ก่อน</th>
                          <th>หลัง</th>
                          <th>หน่วย</th>
                          <th>รวม</th>
                        </tr>
                      </thead>

                      <tbody>
                        <tr>
                          <td className="font-bold">
                            {formatThaiCurrency(row.calculation.unitPrice)}
                          </td>
                          <td className="font-bold">
                            {formatThaiCurrency(row.calculation.serviceFee)}
                          </td>
                          <td className="font-black">
                            {padMeterReading(row.calculation.previousReading)}
                          </td>
                          <td className="font-black">
                            {padMeterReading(row.calculation.currentReading)}
                          </td>
                          <td className="font-black">
                            {row.calculation.usedUnits.toLocaleString("th-TH")}
                          </td>
                          <td className="receipt-total font-black">
                            {formatThaiCurrency(row.calculation.totalAmount)}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <p className="mt-[2px] text-[9px] leading-tight">
                      ประเภท:{" "}
                      <span className="font-bold">
                        {getBillingModeLabel(row.calculation.billingMode)}
                      </span>
                    </p>
                  </div>

                  <footer className="mt-[4px] grid grid-cols-2 gap-4 text-center text-[9px] leading-tight">
                    <div>
                      <div className="border-b border-dotted border-slate-700 pb-[13px]" />
                      <p className="mt-[2px] font-bold">ผู้รับเงิน</p>
                    </div>
                    <div>
                      <div className="border-b border-dotted border-slate-700 pb-[13px]" />
                      <p className="mt-[2px] font-bold">ผู้จ่ายเงิน</p>
                    </div>
                  </footer>
                </article>
              );
            })}
          </section>
        ))
      )}
    </main>
  );
}
