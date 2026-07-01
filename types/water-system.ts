export type UserStatus = "active" | "inactive" | "cut";

export type UserStatusV4 = "ACTIVE" | "SERVICE_ONLY" | "CUT";

export type BillingMode =
  | "normal"
  | "service_only"
  | "meter_replaced"
  | "disconnected_no_charge";

export type BillingPeriodStatus = "open" | "closed" | "locked";

export type MeterStatus =
  | "normal"
  | "backward"
  | "rollover"
  | "meter_replaced"
  | "service_only"
  | "disconnected_no_charge"
  | "error";

export type PaymentStatus = "paid" | "cancelled";

export type BillStatus = "paid" | "unpaid" | "cancelled";

export type UserRole = "admin" | "staff" | "viewer";

export interface AuthSettings {
  username: string;
  password: string;
  role: UserRole;
  sessionHours?: number;
  updatedAt?: string;
}

export interface WaterSettings {
  villageName: string;
  unitPrice: number;
  serviceFee: number;
  meterMaxValue: number;

  receiptVillageLine?: string;
  receiptBookNo?: string;
  receiptPrefix?: string;
  defaultReceiptDay?: number | null;

  createdAt?: string;
  updatedAt?: string;
}

export interface BillingPeriod {
  id: string;
  periodName: string;

  month?: number;
  year?: number;

  status?: BillingPeriodStatus;

  openedAt?: string | null;
  closedAt?: string | null;
  lockedAt?: string | null;

  createdAt?: string;
  updatedAt?: string;
}

export interface WaterUser {
  id: string;

  userCode: string;
  legacyUserId?: string | null;

  fullName: string;

  address: string;
  addressCode?: string | null;

  villageNo: string;
  phone?: string;

  status: UserStatus;
  userStatus?: UserStatusV4;

  defaultBillingMode?: BillingMode;

  serviceOnly: boolean;
  cutMeter: boolean;

  serviceFeeOverride?: number | null;

  lastReading: number;
  lastReadingText?: string;
  lastRecordDateLabel?: string;

  note?: string;

  createdAt: string;
  updatedAt: string;
}

export interface MeterReading {
  id?: string;

  periodId: string;
  waterUserId: string;

  previousReading: number;
  currentReading: number;
  usedUnits: number;

  unitPrice?: number;
  waterAmount?: number;
  serviceFee?: number;
  totalAmount?: number;

  billingMode?: BillingMode;
  meterStatus?: MeterStatus;

  oldMeterFinalReading?: number | null;
  oldMeterUnits?: number;
  newMeterUnits?: number;

  isRollover?: boolean;
  isBackward?: boolean;
  meterMaxValue?: number;

  meterImageUrl?: string;
  photoUrl?: string;

  note?: string;

  recordedAt?: string;
  recordedBy?: string;

  createdAt?: string;
  updatedAt?: string;
}

export interface Payment {
  id: string;

  billId: string;

  periodId?: string;
  waterUserId?: string;
  readingId?: string;

  amount: number;

  paymentMethod?: string;
  paidAt: string;

  receiptNo?: string;
  receiptBookNo?: string;

  status?: PaymentStatus;

  note?: string;

  createdAt?: string;
  updatedAt?: string;
  cancelledAt?: string | null;
}

export interface Bill {
  id: string;

  periodId: string;
  waterUserId: string;
  meterReadingId?: string;

  usedUnits: number;
  waterAmount: number;
  serviceFee: number;
  otherFee: number;
  discount: number;
  totalAmount: number;

  status: BillStatus;

  createdAt?: string;
  updatedAt?: string;
  paidAt?: string | null;
}

export interface BillCalculation {
  billingMode: BillingMode;

  previousReading: number;
  currentReading: number;

  usedUnits: number;
  unitPrice: number;

  waterAmount: number;
  serviceFee: number;
  totalAmount: number;

  oldMeterFinalReading?: number | null;
  oldMeterUnits?: number;
  newMeterUnits?: number;

  meterStatus: MeterStatus;

  isRollover: boolean;
  isBackward: boolean;

  message: string;
}

export interface ReportRow {
  billId: string;
  reading: MeterReading;
  user?: WaterUser;
  serviceFee: number;
  calculation: {
    usedUnits: number;
    waterAmount: number;
    serviceFee: number;
    totalAmount: number;
  };
  payment?: Payment;
  isPaid: boolean;
}

export interface BackupData {
  appName: string;
  version: string;
  exportedAt: string;

  currentPeriod: BillingPeriod;
  settings: WaterSettings;
  users: WaterUser[];
  readings: MeterReading[];
  payments: Payment[];

  auth?: AuthSettings;
}
