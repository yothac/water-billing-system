import type {
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../types/water-system";
import { calculateTotalBill } from "./billing";
import { getUserServiceFee } from "./service-fee";

export function getPeriodNumber(periodId: string) {
  const parts = periodId.split("-");
  const year = Number(parts[1]);
  const month = Number(parts[2]);

  if (!year || !month) {
    return 0;
  }

  return year * 100 + month;
}

export function makeBillId(periodId: string, waterUserId: string) {
  return `bill-${periodId}-${waterUserId}`;
}

export function getPeriodIdFromBillId(billId: string) {
  const match = billId.match(/bill-(period-\d{4}-\d{2})-/);
  return match?.[1] || "";
}

export function getWaterUserIdFromBillId(billId: string) {
  const periodId = getPeriodIdFromBillId(billId);

  if (!periodId) {
    return "";
  }

  return billId.replace(`bill-${periodId}-`, "");
}

export function buildReportRows(
  periodId: string,
  users: WaterUser[],
  readings: MeterReading[],
  payments: Payment[],
  settings: WaterSettings
) {
  return readings
    .filter((reading) => reading.periodId === periodId)
    .map((reading) => {
      const user = users.find((item) => item.id === reading.waterUserId);
      const serviceFee = getUserServiceFee(user, settings);

      const calculation = calculateTotalBill({
        usedUnits: reading.usedUnits,
        unitPrice: settings.unitPrice,
        serviceFee,
        serviceOnly: user?.serviceOnly ?? false,
        cutMeter: user?.cutMeter ?? false,
      });

      const billId = makeBillId(reading.periodId, reading.waterUserId);
      const payment = payments.find((item) => item.billId === billId);

      return {
        billId,
        reading,
        user,
        serviceFee,
        calculation,
        payment,
        isPaid: Boolean(payment),
      };
    });
}

export function getThaiDateTime(value?: string | null) {
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

export function getThaiDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}