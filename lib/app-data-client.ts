"use client";

import { getDataSourceMode, type DataSourceMode } from "./data-source";
import {
  getStoredCurrentPeriod,
  getStoredMeterReadings,
  getStoredPayments,
  getStoredSettings,
  getStoredWaterUsers,
} from "./local-store";
import type {
  BackupData,
  BillingPeriod,
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../types/water-system";

export interface WaterAppData {
  mode: DataSourceMode;
  settings: WaterSettings;
  currentPeriod: BillingPeriod;
  users: WaterUser[];
  readings: MeterReading[];
  payments: Payment[];
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

export function loadLocalWaterAppData(): WaterAppData {
  return {
    mode: "localStorage",
    settings: getStoredSettings(),
    currentPeriod: getStoredCurrentPeriod(),
    users: getStoredWaterUsers(),
    readings: getStoredMeterReadings(),
    payments: getStoredPayments(),
  };
}

export async function loadSupabaseWaterAppData(): Promise<WaterAppData> {
  const [meterResponse, paymentsResponse] = await Promise.all([
    fetch("/api/meter-readings", { cache: "no-store" }),
    fetch("/api/payments", { cache: "no-store" }),
  ]);

  const meterData = (await meterResponse.json()) as MeterDataApiResponse;
  const paymentsData = (await paymentsResponse.json()) as PaymentsApiResponse;

  if (!meterResponse.ok || !meterData.ok) {
    throw new Error(
      meterData.error ||
        meterData.message ||
        "โหลดข้อมูลจดมิเตอร์จาก Supabase ไม่สำเร็จ"
    );
  }

  if (!paymentsResponse.ok || !paymentsData.ok) {
    throw new Error(
      paymentsData.error ||
        paymentsData.message ||
        "โหลดข้อมูลรับชำระจาก Supabase ไม่สำเร็จ"
    );
  }

  return {
    mode: "supabase",
    settings: meterData.settings || getStoredSettings(),
    currentPeriod: meterData.currentPeriod || getStoredCurrentPeriod(),
    users: meterData.users || [],
    readings: meterData.readings || [],
    payments: paymentsData.payments || [],
  };
}

export async function loadWaterAppData(): Promise<WaterAppData> {
  const mode = getDataSourceMode();

  if (mode === "supabase") {
    return loadSupabaseWaterAppData();
  }

  return loadLocalWaterAppData();
}

export function makeBackupDataFromWaterAppData(data: WaterAppData): BackupData {
  return {
    appName: "water-billing-system",
    version:
      data.mode === "supabase"
        ? "supabase-backup-v1"
        : "localStorage-backup-v3-data-link-fix",
    exportedAt: new Date().toISOString(),
    currentPeriod: data.currentPeriod,
    settings: data.settings,
    users: data.users,
    readings: data.readings,
    payments: data.payments,
  };
}

export async function exportCurrentWaterAppData(): Promise<BackupData> {
  return makeBackupDataFromWaterAppData(await loadWaterAppData());
}
