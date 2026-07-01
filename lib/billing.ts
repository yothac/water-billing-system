import type {
    BillCalculation,
    BillingMode,
    MeterStatus,
  } from "../types/water-system";
  
  export function formatThaiNumber(value: number | string | null | undefined) {
    const numberValue = Number(value || 0);
  
    return numberValue.toLocaleString("th-TH");
  }
  
  export function formatThaiCurrency(value: number | string | null | undefined) {
    const numberValue = Number(value || 0);
  
    return numberValue.toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  
  export function padMeterReading(value: number | string | null | undefined) {
    const numberValue = Number(value || 0);
  
    if (!Number.isFinite(numberValue)) {
      return "0000";
    }
  
    return String(Math.max(0, Math.floor(numberValue))).padStart(4, "0");
  }
  
  export function normalizeMoney(value: number | string | null | undefined) {
    const numberValue = Number(value || 0);
  
    if (!Number.isFinite(numberValue)) {
      return 0;
    }
  
    return Math.max(0, numberValue);
  }
  
  export function normalizeMeterValue(value: number | string | null | undefined) {
    const numberValue = Number(value || 0);
  
    if (!Number.isFinite(numberValue)) {
      return 0;
    }
  
    return Math.max(0, Math.floor(numberValue));
  }
  
  export function getSafeBillingMode(
    value: BillingMode | string | null | undefined
  ): BillingMode {
    if (
      value === "normal" ||
      value === "service_only" ||
      value === "meter_replaced" ||
      value === "disconnected_no_charge"
    ) {
      return value;
    }
  
    return "normal";
  }
  
  export function getBillingModeLabel(
    mode: BillingMode | string | null | undefined
  ) {
    const safeMode = getSafeBillingMode(mode);
  
    if (safeMode === "normal") {
      return "ใช้น้ำปกติ";
    }
  
    if (safeMode === "service_only") {
      return "เฉพาะค่าบริการ";
    }
  
    if (safeMode === "meter_replaced") {
      return "เปลี่ยนมิเตอร์";
    }
  
    if (safeMode === "disconnected_no_charge") {
      return "ตัดมิเตอร์ / ไม่คิดเงิน";
    }
  
    return "ใช้น้ำปกติ";
  }
  
  export function getMeterStatusLabel(
    status: MeterStatus | string | null | undefined
  ) {
    if (status === "normal") {
      return "ปกติ";
    }
  
    if (status === "backward") {
      return "เลขย้อนหลัง";
    }
  
    if (status === "rollover") {
      return "มิเตอร์วนรอบ";
    }
  
    if (status === "meter_replaced") {
      return "เปลี่ยนมิเตอร์";
    }
  
    if (status === "service_only") {
      return "เฉพาะค่าบริการ";
    }
  
    if (status === "disconnected_no_charge") {
      return "ตัดมิเตอร์ / ไม่คิดเงิน";
    }
  
    if (status === "error") {
      return "ข้อมูลผิดพลาด";
    }
  
    return "ปกติ";
  }
  
  export function calculateNormalUsedUnits(params: {
    previousReading: number;
    currentReading: number;
    meterMaxValue?: number;
  }) {
    const previousReading = normalizeMeterValue(params.previousReading);
    const currentReading = normalizeMeterValue(params.currentReading);
    const meterMaxValue = normalizeMeterValue(params.meterMaxValue || 9999);
  
    if (currentReading >= previousReading) {
      return {
        usedUnits: currentReading - previousReading,
        meterStatus: "normal" as MeterStatus,
        isRollover: false,
        isBackward: false,
        message: "คำนวณแบบใช้น้ำปกติ",
      };
    }
  
    const previousNearMax = previousReading >= Math.floor(meterMaxValue * 0.8);
    const currentLow = currentReading <= Math.floor(meterMaxValue * 0.2);
  
    if (previousNearMax && currentLow) {
      return {
        usedUnits: meterMaxValue - previousReading + currentReading + 1,
        meterStatus: "rollover" as MeterStatus,
        isRollover: true,
        isBackward: false,
        message: "คำนวณแบบมิเตอร์วนรอบ",
      };
    }
  
    return {
      usedUnits: previousReading - currentReading,
      meterStatus: "backward" as MeterStatus,
      isRollover: false,
      isBackward: true,
      message: "คำนวณแบบเลขย้อนหลัง",
    };
  }
  
  /**
   * ฟังก์ชันชื่อเก่า
   * หน้าเดิมบางหน้ายัง import calculateUsedUnits อยู่
   * จึงต้อง export ไว้เพื่อไม่ให้ระบบพัง
   */
  export function calculateUsedUnits(
    params:
      | {
          previousReading: number;
          currentReading: number;
          meterMaxValue?: number;
        }
      | number,
    currentReadingArg?: number,
    meterMaxValueArg?: number
  ) {
    const previousReading =
      typeof params === "object" ? params.previousReading : params;
  
    const currentReading =
      typeof params === "object"
        ? params.currentReading
        : Number(currentReadingArg || 0);
  
    const meterMaxValue =
      typeof params === "object"
        ? params.meterMaxValue || 9999
        : meterMaxValueArg || 9999;
  
    const result = calculateNormalUsedUnits({
      previousReading,
      currentReading,
      meterMaxValue,
    });
  
    return {
      usedUnits: result.usedUnits,
      isRollover: result.isRollover,
      isBackward: result.isBackward,
      status: result.meterStatus,
      meterStatus: result.meterStatus,
      message: result.message,
    };
  }
  
  /**
   * ฟังก์ชันชื่อเก่าอีกตัว
   * เก็บไว้เพื่อรองรับหน้าเดิมที่เคยใช้ calculateMeterUsage
   */
  export function calculateMeterUsage(params: {
    previousReading: number;
    currentReading: number;
    meterMaxValue?: number;
  }) {
    const result = calculateNormalUsedUnits({
      previousReading: params.previousReading,
      currentReading: params.currentReading,
      meterMaxValue: params.meterMaxValue || 9999,
    });
  
    return {
      usedUnits: result.usedUnits,
      isRollover: result.isRollover,
      isBackward: result.isBackward,
      status: result.meterStatus,
      meterStatus: result.meterStatus,
      message: result.message,
    };
  }
  
  export function calculateMeterReplacedUnits(params: {
    previousReading: number;
    currentReading: number;
    oldMeterFinalReading?: number | null;
  }) {
    const previousReading = normalizeMeterValue(params.previousReading);
    const currentReading = normalizeMeterValue(params.currentReading);
    const oldMeterFinalReading = normalizeMeterValue(
      params.oldMeterFinalReading ?? previousReading
    );
  
    const oldMeterUnits = Math.max(0, oldMeterFinalReading - previousReading);
    const newMeterUnits = Math.max(0, currentReading);
    const usedUnits = oldMeterUnits + newMeterUnits;
  
    return {
      usedUnits,
      oldMeterFinalReading,
      oldMeterUnits,
      newMeterUnits,
    };
  }
  
  export function calculateWaterBillV4(params: {
    previousReading: number;
    currentReading: number;
    unitPrice: number;
    serviceFee: number;
    meterMaxValue?: number;
    billingMode?: BillingMode | string | null;
    oldMeterFinalReading?: number | null;
  }): BillCalculation {
    const billingMode = getSafeBillingMode(params.billingMode);
    const previousReading = normalizeMeterValue(params.previousReading);
    const currentReading = normalizeMeterValue(params.currentReading);
    const unitPrice = normalizeMoney(params.unitPrice);
    const serviceFee = normalizeMoney(params.serviceFee);
    const meterMaxValue = normalizeMeterValue(params.meterMaxValue || 9999);
  
    if (billingMode === "disconnected_no_charge") {
      return {
        billingMode,
        previousReading,
        currentReading,
        usedUnits: 0,
        unitPrice,
        waterAmount: 0,
        serviceFee: 0,
        totalAmount: 0,
        oldMeterFinalReading: null,
        oldMeterUnits: 0,
        newMeterUnits: 0,
        meterStatus: "disconnected_no_charge",
        isRollover: false,
        isBackward: false,
        message: "ตัดมิเตอร์ / ไม่คิดเงิน",
      };
    }
  
    if (billingMode === "service_only") {
      return {
        billingMode,
        previousReading,
        currentReading,
        usedUnits: 0,
        unitPrice,
        waterAmount: 0,
        serviceFee,
        totalAmount: serviceFee,
        oldMeterFinalReading: null,
        oldMeterUnits: 0,
        newMeterUnits: 0,
        meterStatus: "service_only",
        isRollover: false,
        isBackward: false,
        message: "คิดเฉพาะค่าบริการ",
      };
    }
  
    if (billingMode === "meter_replaced") {
      const replaced = calculateMeterReplacedUnits({
        previousReading,
        currentReading,
        oldMeterFinalReading: params.oldMeterFinalReading,
      });
  
      const waterAmount = replaced.usedUnits * unitPrice;
      const totalAmount = waterAmount + serviceFee;
  
      return {
        billingMode,
        previousReading,
        currentReading,
        usedUnits: replaced.usedUnits,
        unitPrice,
        waterAmount,
        serviceFee,
        totalAmount,
        oldMeterFinalReading: replaced.oldMeterFinalReading,
        oldMeterUnits: replaced.oldMeterUnits,
        newMeterUnits: replaced.newMeterUnits,
        meterStatus: "meter_replaced",
        isRollover: false,
        isBackward: false,
        message: `เปลี่ยนมิเตอร์: หน่วยเก่า ${replaced.oldMeterUnits} + หน่วยใหม่ ${replaced.newMeterUnits}`,
      };
    }
  
    const normal = calculateNormalUsedUnits({
      previousReading,
      currentReading,
      meterMaxValue,
    });
  
    const waterAmount = normal.usedUnits * unitPrice;
    const totalAmount = waterAmount + serviceFee;
  
    return {
      billingMode,
      previousReading,
      currentReading,
      usedUnits: normal.usedUnits,
      unitPrice,
      waterAmount,
      serviceFee,
      totalAmount,
      oldMeterFinalReading: null,
      oldMeterUnits: 0,
      newMeterUnits: 0,
      meterStatus: normal.meterStatus,
      isRollover: normal.isRollover,
      isBackward: normal.isBackward,
      message: normal.message,
    };
  }
  
  /**
   * ฟังก์ชันเดิมที่หลายหน้าใช้อยู่
   * ภายในเปลี่ยนมาใช้ logic V4 แล้ว
   */
  export function calculateTotalBill(params: {
    usedUnits?: number;
    unitPrice: number;
    serviceFee: number;
    serviceOnly?: boolean;
    cutMeter?: boolean;
    billingMode?: BillingMode | string | null;
    previousReading?: number;
    currentReading?: number;
    meterMaxValue?: number;
    oldMeterFinalReading?: number | null;
  }) {
    let billingMode = getSafeBillingMode(params.billingMode);
  
    if (params.cutMeter) {
      billingMode = "disconnected_no_charge";
    } else if (params.serviceOnly) {
      billingMode = "service_only";
    }
  
    if (
      params.previousReading !== undefined &&
      params.currentReading !== undefined
    ) {
      const calculation = calculateWaterBillV4({
        previousReading: params.previousReading,
        currentReading: params.currentReading,
        unitPrice: params.unitPrice,
        serviceFee: params.serviceFee,
        meterMaxValue: params.meterMaxValue,
        billingMode,
        oldMeterFinalReading: params.oldMeterFinalReading,
      });
  
      return {
        usedUnits: calculation.usedUnits,
        waterAmount: calculation.waterAmount,
        serviceFee: calculation.serviceFee,
        totalAmount: calculation.totalAmount,
      };
    }
  
    const usedUnits = Math.max(0, Number(params.usedUnits || 0));
    const unitPrice = normalizeMoney(params.unitPrice);
    const serviceFee = normalizeMoney(params.serviceFee);
  
    if (billingMode === "disconnected_no_charge") {
      return {
        usedUnits: 0,
        waterAmount: 0,
        serviceFee: 0,
        totalAmount: 0,
      };
    }
  
    if (billingMode === "service_only") {
      return {
        usedUnits: 0,
        waterAmount: 0,
        serviceFee,
        totalAmount: serviceFee,
      };
    }
  
    const waterAmount = usedUnits * unitPrice;
    const totalAmount = waterAmount + serviceFee;
  
    return {
      usedUnits,
      waterAmount,
      serviceFee,
      totalAmount,
    };
  }
  
  export function makeReceiptNo(params: {
    periodYear?: number | string | null;
    periodMonth?: number | string | null;
    runningNumber?: number | string | null;
    prefix?: string | null;
  }) {
    const prefix = params.prefix || "WR";
    const year = String(params.periodYear || new Date().getFullYear());
    const month = String(params.periodMonth || new Date().getMonth() + 1).padStart(
      2,
      "0"
    );
    const runningNumber = String(params.runningNumber || 1).padStart(4, "0");
  
    return `${prefix}-${year}${month}-${runningNumber}`;
  }