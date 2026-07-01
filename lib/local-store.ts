import type {
  AuthSettings,
  BillingPeriod,
  MeterReading,
  Payment,
  WaterSettings,
  WaterUser,
} from "../types/water-system";
import { currentBillingPeriod, waterSettings, waterUsers } from "./mock-data";

export const STORAGE_KEYS = {
  settings: "water-billing-settings",
  currentPeriod: "water-billing-current-period",
  readings: "water-billing-meter-readings",
  payments: "water-billing-payments",
  users: "water-billing-users",
  auth: "water-billing-auth-settings",
};

const MONTHS = [
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

const memoryStorage = new Map<string, string>();

function canUseLocalStorage() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const testKey = "__water_billing_storage_test__";

    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);

    return true;
  } catch {
    return false;
  }
}

function getRawStorageItem(key: string) {
  try {
    if (canUseLocalStorage()) {
      return window.localStorage.getItem(key);
    }
  } catch {
    return memoryStorage.get(key) || null;
  }

  return memoryStorage.get(key) || null;
}

function setRawStorageItem(key: string, value: string) {
  try {
    if (canUseLocalStorage()) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch {
    memoryStorage.set(key, value);
    return;
  }

  memoryStorage.set(key, value);
}

function removeRawStorageItem(key: string) {
  try {
    if (canUseLocalStorage()) {
      window.localStorage.removeItem(key);
      return;
    }
  } catch {
    memoryStorage.delete(key);
    return;
  }

  memoryStorage.delete(key);
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readStorage<T>(key: string, fallback: T): T {
  return safeJsonParse<T>(getRawStorageItem(key), fallback);
}

function writeStorage<T>(key: string, value: T) {
  setRawStorageItem(key, JSON.stringify(value));
}

function removeStorage(key: string) {
  removeRawStorageItem(key);
}

function getNowIso() {
  return new Date().toISOString();
}

function normalizeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return numberValue;
}

function normalizeString(value: unknown, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function normalizeUser(user: Partial<WaterUser>, index = 0): WaterUser {
  const now = getNowIso();
  const id =
    normalizeString(user.id).trim() ||
    `user-auto-${String(index + 1).padStart(3, "0")}`;

  const userCode =
    normalizeString(user.userCode).trim() ||
    normalizeString(user.legacyUserId).trim() ||
    id.replace(/^user-/, "");

  const cutMeter = Boolean(user.cutMeter || user.status === "cut");
  const serviceOnly = Boolean(user.serviceOnly && !cutMeter);

  return {
    id,
    userCode,
    legacyUserId: user.legacyUserId ?? null,
    fullName:
      normalizeString(user.fullName).trim() ||
      `ผู้ใช้น้ำ ${userCode || id}`,
    address: normalizeString(user.address).trim(),
    addressCode: user.addressCode ?? null,
    villageNo: normalizeString(user.villageNo).trim(),
    phone: normalizeString(user.phone).trim(),
    status: cutMeter ? "cut" : user.status === "inactive" ? "inactive" : "active",
    userStatus: cutMeter ? "CUT" : serviceOnly ? "SERVICE_ONLY" : user.userStatus,
    defaultBillingMode: cutMeter
      ? "disconnected_no_charge"
      : serviceOnly
        ? "service_only"
        : user.defaultBillingMode,
    serviceOnly,
    cutMeter,
    serviceFeeOverride:
      user.serviceFeeOverride === undefined || user.serviceFeeOverride === null
        ? null
        : normalizeNumber(user.serviceFeeOverride, 0),
    lastReading: normalizeNumber(user.lastReading, 0),
    lastReadingText: user.lastReadingText,
    lastRecordDateLabel: user.lastRecordDateLabel,
    note: user.note,
    createdAt: user.createdAt || now,
    updatedAt: user.updatedAt || now,
  };
}

function normalizeUsers(users: Partial<WaterUser>[]) {
  const seen = new Set<string>();
  const normalized: WaterUser[] = [];

  users.forEach((user, index) => {
    const normalizedUser = normalizeUser(user, index);

    if (seen.has(normalizedUser.id)) {
      return;
    }

    seen.add(normalizedUser.id);
    normalized.push(normalizedUser);
  });

  return normalized;
}

function normalizeReading(reading: Partial<MeterReading>): MeterReading | null {
  if (!reading.periodId || !reading.waterUserId) {
    return null;
  }

  const previousReading = normalizeNumber(reading.previousReading, 0);
  const currentReading = normalizeNumber(reading.currentReading, previousReading);
  const usedUnits = normalizeNumber(reading.usedUnits, Math.max(0, currentReading - previousReading));

  return {
    ...reading,
    id: reading.id || `reading-${reading.periodId}-${reading.waterUserId}`,
    periodId: reading.periodId,
    waterUserId: reading.waterUserId,
    previousReading,
    currentReading,
    usedUnits,
    unitPrice:
      reading.unitPrice === undefined ? undefined : normalizeNumber(reading.unitPrice, 0),
    waterAmount:
      reading.waterAmount === undefined ? undefined : normalizeNumber(reading.waterAmount, 0),
    serviceFee:
      reading.serviceFee === undefined ? undefined : normalizeNumber(reading.serviceFee, 0),
    totalAmount:
      reading.totalAmount === undefined ? undefined : normalizeNumber(reading.totalAmount, 0),
    note: reading.note || "",
    createdAt: reading.createdAt || reading.recordedAt || getNowIso(),
    updatedAt: reading.updatedAt || reading.recordedAt || getNowIso(),
  };
}

function normalizeReadings(readings: Partial<MeterReading>[]) {
  const byKey = new Map<string, MeterReading>();

  readings.forEach((reading) => {
    const normalized = normalizeReading(reading);

    if (!normalized) {
      return;
    }

    byKey.set(`${normalized.periodId}:${normalized.waterUserId}`, normalized);
  });

  return Array.from(byKey.values());
}

function normalizePayment(payment: Partial<Payment>): Payment | null {
  if (!payment.billId) {
    return null;
  }

  return {
    id: payment.id || `payment-${payment.billId}`,
    billId: payment.billId,
    periodId: payment.periodId,
    waterUserId: payment.waterUserId,
    readingId: payment.readingId,
    amount: normalizeNumber(payment.amount, 0),
    paymentMethod: payment.paymentMethod || "cash",
    paidAt: payment.paidAt || getNowIso(),
    receiptNo: payment.receiptNo,
    receiptBookNo: payment.receiptBookNo,
    status: payment.status || "paid",
    note: payment.note || "",
    createdAt: payment.createdAt || payment.paidAt || getNowIso(),
    updatedAt: payment.updatedAt || payment.paidAt || getNowIso(),
    cancelledAt: payment.cancelledAt ?? null,
  };
}

function normalizePayments(payments: Partial<Payment>[]) {
  const byBillId = new Map<string, Payment>();

  payments.forEach((payment) => {
    const normalized = normalizePayment(payment);

    if (!normalized) {
      return;
    }

    byBillId.set(normalized.billId, normalized);
  });

  return Array.from(byBillId.values());
}

function makePlaceholderUserFromReading(reading: MeterReading, index: number): WaterUser {
  const now = getNowIso();
  const shortCode = reading.waterUserId.replace(/^user-/, "");

  return {
    id: reading.waterUserId,
    userCode: shortCode || `AUTO-${index + 1}`,
    legacyUserId: null,
    fullName: `ไม่พบข้อมูลผู้ใช้น้ำ (${shortCode || reading.waterUserId})`,
    address: "",
    addressCode: null,
    villageNo: "",
    phone: "",
    status:
      reading.billingMode === "disconnected_no_charge" ? "cut" : "active",
    userStatus:
      reading.billingMode === "disconnected_no_charge"
        ? "CUT"
        : reading.billingMode === "service_only"
          ? "SERVICE_ONLY"
          : undefined,
    defaultBillingMode: reading.billingMode || "normal",
    serviceOnly: reading.billingMode === "service_only",
    cutMeter: reading.billingMode === "disconnected_no_charge",
    serviceFeeOverride:
      reading.serviceFee !== undefined && reading.serviceFee !== null
        ? Number(reading.serviceFee)
        : null,
    lastReading: normalizeNumber(reading.currentReading, 0),
    lastReadingText: String(normalizeNumber(reading.currentReading, 0)).padStart(4, "0"),
    lastRecordDateLabel: reading.periodId,
    note: "สร้างชั่วคราวจากรายการจดมิเตอร์ เพราะไม่พบข้อมูลผู้ใช้น้ำ",
    createdAt: now,
    updatedAt: now,
  };
}

function ensureUsersLinkedWithReadings(users: WaterUser[], readings: MeterReading[]) {
  const nextUsers = [...users];
  const existingIds = new Set(nextUsers.map((user) => user.id));

  readings.forEach((reading, index) => {
    if (!existingIds.has(reading.waterUserId)) {
      const placeholder = makePlaceholderUserFromReading(reading, index);
      nextUsers.push(placeholder);
      existingIds.add(placeholder.id);
    }
  });

  return nextUsers;
}

export function buildBillingPeriod(month: number, year: number): BillingPeriod {
  const safeMonth = Math.min(Math.max(Number(month) || 1, 1), 12);
  const safeYear = Number(year) || 2569;

  return {
    id: `period-${safeYear}-${String(safeMonth).padStart(2, "0")}`,
    periodName: `${MONTHS[safeMonth - 1]} ${safeYear}`,
    month: safeMonth,
    year: safeYear,
    status: "open",
    openedAt: getNowIso(),
    closedAt: null,
    lockedAt: null,
  };
}

export function getStoredSettings(): WaterSettings {
  const storedSettings = readStorage<Partial<WaterSettings>>(STORAGE_KEYS.settings, {});

  return {
    ...waterSettings,
    ...storedSettings,
    unitPrice: normalizeNumber(storedSettings.unitPrice ?? waterSettings.unitPrice, waterSettings.unitPrice),
    serviceFee: normalizeNumber(storedSettings.serviceFee ?? waterSettings.serviceFee, waterSettings.serviceFee),
    meterMaxValue: normalizeNumber(storedSettings.meterMaxValue ?? waterSettings.meterMaxValue, waterSettings.meterMaxValue),
  };
}

export function saveStoredSettings(settings: WaterSettings) {
  writeStorage(STORAGE_KEYS.settings, {
    ...settings,
    updatedAt: getNowIso(),
  });
}

export function resetStoredSettings() {
  removeStorage(STORAGE_KEYS.settings);
}

export function getStoredCurrentPeriod(): BillingPeriod {
  const storedPeriod = readStorage<Partial<BillingPeriod>>(STORAGE_KEYS.currentPeriod, {});

  return {
    ...currentBillingPeriod,
    ...storedPeriod,
    id: storedPeriod.id || currentBillingPeriod.id,
    periodName: storedPeriod.periodName || currentBillingPeriod.periodName,
    month: Number(storedPeriod.month || currentBillingPeriod.month || 1),
    year: Number(storedPeriod.year || currentBillingPeriod.year || 2569),
    status: storedPeriod.status || currentBillingPeriod.status || "open",
  };
}

export function saveStoredCurrentPeriod(period: BillingPeriod) {
  writeStorage(STORAGE_KEYS.currentPeriod, {
    ...period,
    updatedAt: getNowIso(),
  });
}

export function resetStoredCurrentPeriod() {
  removeStorage(STORAGE_KEYS.currentPeriod);
}

export function getStoredMeterReadings(): MeterReading[] {
  const storedReadings = readStorage<Partial<MeterReading>[]>(
    STORAGE_KEYS.readings,
    []
  );

  const normalized = normalizeReadings(storedReadings);

  if (storedReadings.length !== normalized.length) {
    saveStoredMeterReadings(normalized);
  }

  return normalized;
}

export function saveStoredMeterReadings(readings: MeterReading[]) {
  writeStorage(STORAGE_KEYS.readings, normalizeReadings(readings));
}

export function upsertStoredMeterReading(reading: MeterReading) {
  const existingReadings = getStoredMeterReadings();
  const nextReadings = [
    ...existingReadings.filter(
      (item) =>
        !(
          item.periodId === reading.periodId &&
          item.waterUserId === reading.waterUserId
        )
    ),
    reading,
  ];

  saveStoredMeterReadings(nextReadings);

  return getStoredMeterReadings();
}

export function resetStoredMeterReadings() {
  removeStorage(STORAGE_KEYS.readings);
}

export function getStoredWaterUsers(): WaterUser[] {
  const storedRaw = getRawStorageItem(STORAGE_KEYS.users);

  const storedUsers = safeJsonParse<Partial<WaterUser>[] | null>(storedRaw, null);
  const readings = getStoredMeterReadings();

  let baseUsers: WaterUser[];

  if (Array.isArray(storedUsers) && storedUsers.length > 0) {
    baseUsers = normalizeUsers(storedUsers);
  } else {
    baseUsers = normalizeUsers(waterUsers);
  }

  const linkedUsers = ensureUsersLinkedWithReadings(baseUsers, readings);

  if (
    !Array.isArray(storedUsers) ||
      storedUsers.length === 0 ||
      linkedUsers.length !== baseUsers.length
  ) {
    saveStoredWaterUsers(linkedUsers);
  }

  return linkedUsers;
}

export function saveStoredWaterUsers(users: WaterUser[]) {
  writeStorage(STORAGE_KEYS.users, normalizeUsers(users));
}

export function upsertStoredWaterUser(user: WaterUser) {
  const existingUsers = getStoredWaterUsers();
  const nextUsers = [
    ...existingUsers.filter((item) => item.id !== user.id),
    user,
  ];

  saveStoredWaterUsers(nextUsers);

  return getStoredWaterUsers();
}

export function deleteStoredWaterUser(id: string) {
  const nextUsers = getStoredWaterUsers().filter((user) => user.id !== id);

  saveStoredWaterUsers(nextUsers);

  return nextUsers;
}

export function resetStoredWaterUsers() {
  removeStorage(STORAGE_KEYS.users);
}

export function getStoredPayments(): Payment[] {
  const storedPayments = readStorage<Partial<Payment>[]>(
    STORAGE_KEYS.payments,
    []
  );

  const normalized = normalizePayments(storedPayments);

  if (storedPayments.length !== normalized.length) {
    saveStoredPayments(normalized);
  }

  return normalized;
}

export function saveStoredPayments(payments: Payment[]) {
  writeStorage(STORAGE_KEYS.payments, normalizePayments(payments));
}

export function upsertStoredPayment(payment: Payment) {
  const existingPayments = getStoredPayments();
  const nextPayments = [
    ...existingPayments.filter((item) => item.billId !== payment.billId),
    payment,
  ];

  saveStoredPayments(nextPayments);

  return getStoredPayments();
}

export function resetStoredPayments() {
  removeStorage(STORAGE_KEYS.payments);
}

export function getStoredAuthSettings(): AuthSettings {
  return readStorage<AuthSettings>(STORAGE_KEYS.auth, {
    username: "admin",
    password: "1234",
    role: "admin",
    sessionHours: 3,
  });
}

export function saveStoredAuthSettings(authSettings: AuthSettings) {
  writeStorage(STORAGE_KEYS.auth, {
    ...authSettings,
    updatedAt: getNowIso(),
  });
}

export function exportAllData() {
  const readings = getStoredMeterReadings();
  const users = ensureUsersLinkedWithReadings(getStoredWaterUsers(), readings);

  if (canUseLocalStorage()) {
    saveStoredWaterUsers(users);
  }

  return {
    appName: "water-billing-system",
    version: "localStorage-backup-v3-data-link-fix",
    exportedAt: getNowIso(),
    currentPeriod: getStoredCurrentPeriod(),
    settings: getStoredSettings(),
    users,
    readings,
    payments: getStoredPayments(),
    auth: getStoredAuthSettings(),
  };
}

export function importAllData(data: any) {
  if (!data || typeof data !== "object") {
    throw new Error("ไฟล์ Backup ไม่ถูกต้อง");
  }

  const nextSettings = data.settings || waterSettings;
  const nextCurrentPeriod = data.currentPeriod || currentBillingPeriod;
  const nextReadings = normalizeReadings(
    Array.isArray(data.readings) ? data.readings : []
  );

  const importedUsers = normalizeUsers(
    Array.isArray(data.users) && data.users.length > 0
      ? data.users
      : waterUsers
  );

  const nextUsers = ensureUsersLinkedWithReadings(importedUsers, nextReadings);
  const nextPayments = normalizePayments(
    Array.isArray(data.payments) ? data.payments : []
  );

  saveStoredSettings(nextSettings);
  saveStoredCurrentPeriod(nextCurrentPeriod);
  saveStoredMeterReadings(nextReadings);
  saveStoredWaterUsers(nextUsers);
  saveStoredPayments(nextPayments);

  if (data.auth) {
    saveStoredAuthSettings(data.auth);
  }

  return exportAllData();
}

export function resetAllStoredData() {
  Object.values(STORAGE_KEYS).forEach((key) => removeStorage(key));
}
