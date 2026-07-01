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

function makeBillId(periodId: string, waterUserId: string) {
  return `bill-${periodId}-${waterUserId}`;
}

function getPeriodIdFromBillId(billId: string) {
  const match = billId.match(/bill-(period-\d{4}-\d{2})-/);
  return match?.[1] || "";
}

function getWaterUserIdFromBillId(billId: string) {
  const periodId = getPeriodIdFromBillId(billId);

  if (!periodId) {
    return "";
  }

  return billId.replace(`bill-${periodId}-`, "");
}

function getQueryParam(name: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get(name) || "";
}

function getReceiptMode(): ReceiptMode {
  const mode = getQueryParam("mode");

  if (mode === "receipt") {
    return "receipt";
  }

  return "invoice";
}

function toThaiYear(year: number) {
  return year > 2400 ? year : year + 543;
}

function getThaiDateParts(value?: string | null, fallbackDay?: number | null) {
  const date = value ? new Date(value) : new Date();
  const day = fallbackDay || date.getDate();

  const month = date.toLocaleDateString("th-TH", {
    month: "long",
  });

  const year = date.getFullYear() + 543;

  return {
    day,
    month,
    year,
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
    const year = Number(match[1]);
    const month = Number(match[2]);

    return {
      month: THAI_MONTHS[month - 1] || "-",
      year: toThaiYear(year),
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

export default function ReceiptPage() {
  const [settings, setSettings] = useState<WaterSettings>({
    villageName: "ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน",
    unitPrice: 8,
    serviceFee: 20,
    meterMaxValue: 9999,
    receiptVillageLine: "",
    receiptBookNo: "",
    receiptPrefix: "WR",
    defaultReceiptDay: null,
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

  const [billId, setBillId] = useState("");
  const [mode, setMode] = useState<ReceiptMode>("invoice");

  useEffect(() => {
    const queryBillId = getQueryParam("billId");
    const queryMode = getReceiptMode();

    async function refreshData() {
      try {
        const data = await loadWaterAppData();

        const fallbackReading =
          data.readings.find(
            (reading) => reading.periodId === data.currentPeriod.id
          ) || data.readings[0];

        setSettings(data.settings);
        setCurrentPeriod(data.currentPeriod);
        setUsers(data.users);
        setReadings(data.readings);
        setPayments(data.payments);
        setMode(queryMode);

        if (queryBillId) {
          setBillId(queryBillId);
        } else if (fallbackReading) {
          setBillId(
            makeBillId(fallbackReading.periodId, fallbackReading.waterUserId)
          );
        }
      } catch (error) {
        console.error(error);
        setMode(queryMode);
      }
    }

    void refreshData();
  }, []);

  const receiptData = useMemo(() => {
    if (!billId) {
      return null;
    }

    const periodId = getPeriodIdFromBillId(billId);
    const waterUserId = getWaterUserIdFromBillId(billId);

    const reading = readings.find(
      (item) => item.periodId === periodId && item.waterUserId === waterUserId
    );

    const user = users.find((item) => item.id === waterUserId);

    if (!reading || !user) {
      return null;
    }

    const payment = payments.find(
      (item) => item.billId === billId && item.status !== "cancelled"
    );

    const serviceFee =
      reading.serviceFee !== undefined
        ? Number(reading.serviceFee || 0)
        : getUserServiceFee(user, settings);

    const billingMode = reading.billingMode || getDefaultBillingMode(user);

    const calculation = calculateWaterBillV4({
      previousReading: reading.previousReading,
      currentReading: reading.currentReading,
      unitPrice: reading.unitPrice ?? settings.unitPrice,
      serviceFee,
      meterMaxValue: reading.meterMaxValue ?? settings.meterMaxValue,
      billingMode,
      oldMeterFinalReading: reading.oldMeterFinalReading,
    });

    const dateParts = getThaiDateParts(
      mode === "receipt" ? payment?.paidAt : undefined,
      settings.defaultReceiptDay || null
    );

    const periodParts = getPeriodParts(currentPeriod);

    const runningNumber =
      readings
        .filter((item) => item.periodId === reading.periodId)
        .findIndex((item) => item.waterUserId === reading.waterUserId) + 1;

    const receiptNo =
      payment?.receiptNo ||
      makeReceiptNo({
        periodYear: currentPeriod.year || new Date().getFullYear(),
        periodMonth: currentPeriod.month || new Date().getMonth() + 1,
        runningNumber: runningNumber > 0 ? runningNumber : 1,
        prefix: settings.receiptPrefix || "WR",
      });

    return {
      periodId,
      waterUserId,
      reading,
      user,
      payment,
      calculation,
      dateParts,
      periodParts,
      receiptNo,
    };
  }, [billId, readings, users, payments, settings, currentPeriod, mode]);

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
          size: A5 landscape;
          margin: 0;
        }

        @media print {
          .no-print {
            display: none !important;
          }

          body {
            background: #ffffff !important;
          }

          .receipt-paper {
            margin: 0 !important;
            width: 210mm !important;
            min-height: 148mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 8mm !important;
          }
        }

        @media screen and (max-width: 640px) {
          .receipt-paper {
            width: calc(100vw - 24px) !important;
            min-height: auto !important;
            padding: 16px !important;
          }

          .receipt-paper header > div {
            flex-wrap: wrap;
            row-gap: 8px;
          }

          .receipt-paper header span[class*="min-w-"] {
            min-width: 0 !important;
          }

          .receipt-paper table {
            table-layout: fixed;
            font-size: 11px;
          }

          .receipt-paper th,
          .receipt-paper td {
            padding: 6px 4px !important;
            word-break: break-word;
          }
        }
      `}</style>

      <section className="no-print mx-auto mb-4 flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4">
        <div>
          <Link href="/reports" className="text-sm font-black text-blue-700">
            ← กลับรายงาน
          </Link>

          <h1 className="mt-2 text-2xl font-black text-slate-900">
            {documentTitle}
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Data Link Fix · ใช้ข้อมูลจาก local-store
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={
              billId
                ? `/receipt?billId=${billId}&mode=invoice`
                : "/receipt?mode=invoice"
            }
            className={
              mode === "invoice"
                ? "rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow"
                : "rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-700 ring-1 ring-blue-200"
            }
          >
            ใบแจ้งหนี้
          </Link>

          <Link
            href={
              billId
                ? `/receipt?billId=${billId}&mode=receipt`
                : "/receipt?mode=receipt"
            }
            className={
              mode === "receipt"
                ? "rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow"
                : "rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-700 ring-1 ring-emerald-200"
            }
          >
            ใบเสร็จ
          </Link>

          <button
            onClick={() => window.print()}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow"
          >
            พิมพ์เอกสาร
          </button>
        </div>
      </section>

      {!receiptData ? (
        <section className="receipt-paper mx-auto flex min-h-[148mm] w-[210mm] max-w-[calc(100vw-24px)] flex-col items-center justify-center rounded-2xl bg-white p-10 text-center shadow print:shadow-none">
          <div className="text-5xl">📄</div>

          <h2 className="mt-4 text-2xl font-black text-slate-900">
            ไม่พบข้อมูลเอกสาร
          </h2>

          <p className="mt-2 text-slate-500">
            กรุณาเปิดจากปุ่มใบแจ้งหนี้หรือใบเสร็จในหน้ารายงาน / รับชำระ
          </p>
        </section>
      ) : (
        <section className="receipt-paper mx-auto flex min-h-[148mm] w-[210mm] max-w-[calc(100vw-24px)] flex-col rounded-2xl bg-white p-10 shadow print:shadow-none">
          <header className="space-y-2 border-b border-dashed border-slate-500 pb-3 text-slate-800">
            <div className="flex items-baseline gap-2 text-sm">
              <span>เล่มที่</span>
              <span className="min-w-20 flex-1 border-b border-dotted border-slate-600 px-2 font-bold">
                {settings.receiptBookNo || "..........."}
              </span>

              <div className="flex-1" />

              <span className="whitespace-nowrap font-black">
                {documentTitle} เลขที่
              </span>

              <span className="min-w-40 border-b border-dotted border-slate-600 px-2 text-center font-black">
                {receiptData.receiptNo}
              </span>
            </div>

            <p className="text-center text-lg font-black">{villageLine}</p>

            <div className="flex items-baseline gap-2 text-sm">
              <span>วันที่</span>
              <span className="min-w-14 border-b border-dotted border-slate-600 px-2 text-center font-bold">
                {receiptData.dateParts.day}
              </span>

              <span>เดือน</span>
              <span className="min-w-32 border-b border-dotted border-slate-600 px-2 text-center font-bold">
                {receiptData.dateParts.month}
              </span>

              <span>พ.ศ.</span>
              <span className="min-w-24 border-b border-dotted border-slate-600 px-2 text-center font-bold">
                {receiptData.dateParts.year}
              </span>

              <span className="ml-auto text-xs text-slate-500">
                รอบบิล {receiptData.periodParts.month}{" "}
                {receiptData.periodParts.year}
              </span>
            </div>

            <div className="flex items-baseline gap-2 text-sm">
              <span>ชื่อผู้ใช้น้ำ</span>
              <span className="flex-1 border-b border-dotted border-slate-600 px-2 text-lg font-black">
                {receiptData.user.fullName}
              </span>

              <span>รหัส</span>
              <span className="min-w-24 border-b border-dotted border-slate-600 px-2 text-center font-bold">
                {receiptData.user.userCode}
              </span>
            </div>

            <div className="flex items-baseline gap-2 text-sm">
              <span>บ้าน/รหัส</span>
              <span className="min-w-40 flex-1 border-b border-dotted border-slate-600 px-2 font-bold">
                {receiptData.user.address || "-"}
              </span>

              <span>หมู่</span>
              <span className="min-w-20 border-b border-dotted border-slate-600 px-2 text-center font-bold">
                {receiptData.user.villageNo || "-"}
              </span>

              <span>ประเภท</span>
              <span className="min-w-36 border-b border-dotted border-slate-600 px-2 text-center font-bold">
                {getBillingModeLabel(receiptData.calculation.billingMode)}
              </span>
            </div>
          </header>

          <div className="mt-5 flex-grow">
            <table className="w-full border-collapse text-center text-sm">
              <thead className="border-2 border-slate-800">
                <tr>
                  <th className="border border-slate-700 p-2">หน่วยละ</th>
                  <th className="border border-slate-700 p-2">ค่าบริการ</th>
                  <th className="border border-slate-700 p-2">อ่านครั้งก่อน</th>
                  <th className="border border-slate-700 p-2">อ่านครั้งหลัง</th>
                  <th className="border border-slate-700 p-2">
                    จำนวนหน่วยที่ใช้
                  </th>
                  <th className="border border-slate-700 p-2">
                    รวมเงินทั้งสิ้น
                  </th>
                </tr>
              </thead>

              <tbody className="border-2 border-slate-800">
                <tr className="h-16">
                  <td className="border border-slate-700 p-2 font-bold">
                    {formatThaiCurrency(receiptData.calculation.unitPrice)} บาท
                  </td>

                  <td className="border border-slate-700 p-2 font-bold">
                    {formatThaiCurrency(receiptData.calculation.serviceFee)} บาท
                  </td>

                  <td className="border border-slate-700 p-2 text-lg font-black">
                    {padMeterReading(receiptData.calculation.previousReading)}
                  </td>

                  <td className="border border-slate-700 p-2 text-lg font-black">
                    {padMeterReading(receiptData.calculation.currentReading)}
                  </td>

                  <td className="border border-slate-700 p-2 text-lg font-black">
                    {receiptData.calculation.usedUnits.toLocaleString("th-TH")}
                  </td>

                  <td className="border border-slate-700 p-2 text-xl font-black">
                    {formatThaiCurrency(receiptData.calculation.totalAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <footer className="mt-8 grid grid-cols-2 gap-10 text-center text-sm">
            <div>
              <div className="border-b border-dotted border-slate-700 pb-8" />
              <p className="mt-2 font-bold">ผู้รับเงิน</p>
            </div>

            <div>
              <div className="border-b border-dotted border-slate-700 pb-8" />
              <p className="mt-2 font-bold">ผู้จ่ายเงิน / ผู้ใช้น้ำ</p>
            </div>
          </footer>
        </section>
      )}
    </main>
  );
}
