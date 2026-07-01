"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  calculateWaterBillV4,
  formatThaiCurrency,
  formatThaiNumber,
  getBillingModeLabel,
  getMeterStatusLabel,
  padMeterReading,
} from "../../lib/billing";
import { getUserServiceFee } from "../../lib/service-fee";
import {
  getDataSourceMode,
  getDataSourceModeLabel,
  type DataSourceMode,
} from "../../lib/data-source";
import {
  getStoredCurrentPeriod,
  getStoredMeterReadings,
  getStoredSettings,
  getStoredWaterUsers,
  saveStoredMeterReadings,
  saveStoredWaterUsers,
} from "../../lib/local-store";
import type {
  BillingMode,
  BillingPeriod,
  MeterReading,
  UserStatus,
  UserStatusV4,
  WaterSettings,
  WaterUser,
} from "../../types/water-system";

interface MeterReadingApiResponse {
  ok: boolean;
  message?: string;
  error?: string;
  settings?: WaterSettings;
  currentPeriod?: BillingPeriod;
  users?: WaterUser[];
  readings?: MeterReading[];
}

function getDefaultPeriod(): BillingPeriod {
  return {
    id: "period-2569-06",
    periodName: "มิถุนายน 2569",
    month: 6,
    year: 2569,
    status: "open",
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

function isUserActive(user: WaterUser) {
  return user.status !== "inactive";
}

type UserSortMode = "userCode" | "address";

function compareByUserCode(a: WaterUser, b: WaterUser) {
  return String(a.userCode || "").localeCompare(String(b.userCode || ""), "th-TH", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareByAddress(a: WaterUser, b: WaterUser) {
  const addressA = String(a.address || a.addressCode || "");
  const addressB = String(b.address || b.addressCode || "");

  return addressA.localeCompare(addressB, "th-TH", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareByName(a: WaterUser, b: WaterUser) {
  return String(a.fullName || "").localeCompare(String(b.fullName || ""), "th-TH", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortUsers(users: WaterUser[], sortMode: UserSortMode = "userCode") {
  return [...users].sort((a, b) => {
    if (sortMode === "address") {
      return compareByAddress(a, b) || compareByUserCode(a, b) || compareByName(a, b);
    }

    return compareByUserCode(a, b) || compareByAddress(a, b) || compareByName(a, b);
  });
}

function makeReadingId(periodId: string, waterUserId: string) {
  return `reading-${periodId}-${waterUserId}`;
}

function toNumber(value: string | number | undefined | null, fallback = 0) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export default function MeterReadingPage() {
  const [settings, setSettings] = useState<WaterSettings>({
    villageName: "ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน",
    unitPrice: 8,
    serviceFee: 20,
    meterMaxValue: 9999,
  });

  const [currentPeriod, setCurrentPeriod] =
    useState<BillingPeriod>(getDefaultPeriod());

  const [users, setUsers] = useState<WaterUser[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [userSortMode, setUserSortMode] = useState<UserSortMode>("userCode");
  const [billingMode, setBillingMode] = useState<BillingMode>("normal");

  const [currentReadingText, setCurrentReadingText] = useState("");
  const [oldMeterFinalReadingText, setOldMeterFinalReadingText] = useState("");
  const [serviceFeeText, setServiceFeeText] = useState("");
  const [note, setNote] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [dataSourceMode, setDataSourceMode] =
    useState<DataSourceMode>("localStorage");
  const [isLoadingData, setIsLoadingData] = useState(false);

  function applyLoadedMeterData(
    loadedSettings: WaterSettings,
    loadedPeriod: BillingPeriod,
    loadedUsers: WaterUser[],
    loadedReadings: MeterReading[]
  ) {
    setSettings(loadedSettings);
    setCurrentPeriod(loadedPeriod);
    setUsers(loadedUsers);
    setReadings(loadedReadings);

    const sortedActiveUsers = sortUsers(loadedUsers, userSortMode).filter(isUserActive);

    const firstUnreadUser = sortedActiveUsers.find(
      (user) =>
        !loadedReadings.some(
          (reading) =>
            reading.periodId === loadedPeriod.id &&
            reading.waterUserId === user.id
        )
    );

    if (firstUnreadUser) {
      const firstMode = getDefaultBillingMode(firstUnreadUser);

      setSelectedUserId(firstUnreadUser.id);
      setBillingMode(firstMode);
      setCurrentReadingText("");
      setOldMeterFinalReadingText(String(firstUnreadUser.lastReading || 0));
      setServiceFeeText(String(getUserServiceFee(firstUnreadUser, loadedSettings)));
      setNote("");
    } else {
      setSelectedUserId("");
      setBillingMode("normal");
      setCurrentReadingText("");
      setOldMeterFinalReadingText("");
      setServiceFeeText(String(loadedSettings.serviceFee || 0));
      setNote("");
    }
  }

  async function loadSupabaseMeterData() {
    setIsLoadingData(true);

    try {
      const response = await fetch("/api/meter-readings", {
        cache: "no-store",
      });

      const data = (await response.json()) as MeterReadingApiResponse;

      if (!response.ok || !data.ok) {
        showError(data.error || data.message || "โหลดข้อมูลจดมิเตอร์จาก Supabase ไม่สำเร็จ");
        return;
      }

      applyLoadedMeterData(
        data.settings || getStoredSettings(),
        data.currentPeriod || getDefaultPeriod(),
        data.users || [],
        data.readings || []
      );
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "โหลดข้อมูลจดมิเตอร์จาก Supabase ไม่สำเร็จ"
      );
    } finally {
      setIsLoadingData(false);
    }
  }

  useEffect(() => {
    const mode = getDataSourceMode();

    setDataSourceMode(mode);

    if (mode === "supabase") {
      void loadSupabaseMeterData();
      return;
    }

    applyLoadedMeterData(
      getStoredSettings(),
      getStoredCurrentPeriod(),
      getStoredWaterUsers(),
      getStoredMeterReadings()
    );
  }, []);

  const activeUsers = useMemo(() => {
    return sortUsers(users.filter(isUserActive), userSortMode);
  }, [users, userSortMode]);

  const periodReadings = useMemo(() => {
    return readings.filter((reading) => reading.periodId === currentPeriod.id);
  }, [readings, currentPeriod.id]);

  const unreadUsers = useMemo(() => {
    return activeUsers.filter(
      (user) =>
        !periodReadings.some((reading) => reading.waterUserId === user.id)
    );
  }, [activeUsers, periodReadings]);

  const selectedUser = useMemo(() => {
    return activeUsers.find((user) => user.id === selectedUserId);
  }, [activeUsers, selectedUserId]);

  const existingReading = useMemo(() => {
    if (!selectedUser) {
      return undefined;
    }

    return periodReadings.find(
      (reading) => reading.waterUserId === selectedUser.id
    );
  }, [periodReadings, selectedUser]);

  useEffect(() => {
    if (isLoadingData) {
      return;
    }

    if (unreadUsers.length === 0) {
      if (selectedUserId && !existingReading) {
        clearSelectedUser();
      }

      return;
    }

    if (!selectedUserId) {
      selectUser(unreadUsers[0]);
      return;
    }

    const selectedIsUnread = unreadUsers.some(
      (user) => user.id === selectedUserId
    );

    if (!selectedIsUnread && !existingReading) {
      selectUser(unreadUsers[0]);
    }
  }, [existingReading, isLoadingData, selectedUserId, unreadUsers]);

  const filteredUsers = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    if (!query) {
      return unreadUsers;
    }

    return unreadUsers.filter((user) =>
      [
        user.userCode,
        user.fullName,
        user.address,
        user.addressCode,
        user.villageNo,
        user.phone,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [unreadUsers, keyword]);

  const selectedUserIndex = useMemo(() => {
    if (!selectedUser) {
      return -1;
    }

    return activeUsers.findIndex((user) => user.id === selectedUser.id);
  }, [activeUsers, selectedUser]);

  const previousReading =
    existingReading?.previousReading ?? selectedUser?.lastReading ?? 0;

  const isCurrentReadingRequired =
    billingMode === "normal" || billingMode === "meter_replaced";

  const hasCurrentReadingInput =
    !isCurrentReadingRequired || currentReadingText.trim() !== "";

  const hasMeterReplacementInput =
    billingMode !== "meter_replaced" ||
    (currentReadingText.trim() !== "" && oldMeterFinalReadingText.trim() !== "");

  const canShowSummaryAmounts =
    Boolean(selectedUser) &&
    hasCurrentReadingInput &&
    hasMeterReplacementInput &&
    (billingMode !== "service_only" || serviceFeeText.trim() !== "");

  const serviceFee = useMemo(() => {
    if (billingMode === "service_only") {
      return toNumber(serviceFeeText, settings.serviceFee || 0);
    }

    return getUserServiceFee(selectedUser, settings);
  }, [billingMode, serviceFeeText, selectedUser, settings]);

  const effectiveCurrentReading = useMemo(() => {
    if (billingMode === "service_only") {
      return previousReading;
    }

    if (billingMode === "disconnected_no_charge") {
      return previousReading;
    }

    if (currentReadingText.trim() === "") {
      return previousReading;
    }

    return Number(currentReadingText || 0);
  }, [billingMode, currentReadingText, previousReading]);

  const calculation = useMemo(() => {
    return calculateWaterBillV4({
      previousReading,
      currentReading: effectiveCurrentReading,
      unitPrice: settings.unitPrice,
      serviceFee,
      meterMaxValue: settings.meterMaxValue,
      billingMode,
      oldMeterFinalReading:
        billingMode === "meter_replaced"
          ? Number(oldMeterFinalReadingText || previousReading)
          : null,
    });
  }, [
    previousReading,
    effectiveCurrentReading,
    settings.unitPrice,
    settings.meterMaxValue,
    serviceFee,
    billingMode,
    oldMeterFinalReadingText,
  ]);

  const completedCount = periodReadings.length;
  const totalCount = activeUsers.length;
  const remainingCount = Math.max(0, totalCount - completedCount);
  const progressPercent =
    totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const isPeriodLocked = currentPeriod.status === "locked";

  function showMessage(text: string) {
    setMessage(text);
    setError("");
    window.setTimeout(() => setMessage(""), 2500);
  }

  function showError(text: string) {
    setError(text);
    setMessage("");
  }

  function clearSelectedUser() {
    setSelectedUserId("");
    setBillingMode("normal");
    setCurrentReadingText("");
    setOldMeterFinalReadingText("");
    setServiceFeeText(String(settings.serviceFee || 0));
    setNote("");
    setError("");
  }

  function selectUser(user: WaterUser) {
    const reading = periodReadings.find(
      (item) => item.waterUserId === user.id
    );

    setSelectedUserId(user.id);

    const nextBillingMode = reading?.billingMode || getDefaultBillingMode(user);

    setBillingMode(nextBillingMode);

    setCurrentReadingText(
      reading &&
        reading.billingMode !== "service_only" &&
        reading.billingMode !== "disconnected_no_charge"
        ? String(reading.currentReading || "")
        : ""
    );

    setOldMeterFinalReadingText(
      reading?.oldMeterFinalReading !== undefined &&
        reading?.oldMeterFinalReading !== null
        ? String(reading.oldMeterFinalReading)
        : String(user.lastReading || 0)
    );

    setServiceFeeText(String(reading?.serviceFee ?? getUserServiceFee(user, settings)));
    setNote(reading?.note || "");
    setError("");
  }

  function selectFirstUnreadUserBySortMode(nextSortMode: UserSortMode) {
    const nextUnreadUser = sortUsers(users.filter(isUserActive), nextSortMode).find(
      (user) =>
        !periodReadings.some(
          (reading) =>
            reading.periodId === currentPeriod.id &&
            reading.waterUserId === user.id
        )
    );

    if (nextUnreadUser) {
      selectUser(nextUnreadUser);
      return;
    }

    clearSelectedUser();
  }

  function handleUserSortModeChange(nextSortMode: UserSortMode) {
    setUserSortMode(nextSortMode);
    setKeyword("");
    selectFirstUnreadUserBySortMode(nextSortMode);
  }

  function selectNextUser() {
    if (unreadUsers.length === 0) {
      clearSelectedUser();
      showMessage("จดมิเตอร์ครบทุกคนในรอบบิลนี้แล้ว");
      return;
    }

    const currentIndex = selectedUser
      ? unreadUsers.findIndex((user) => user.id === selectedUser.id)
      : -1;

    const nextIndex =
      currentIndex >= 0 ? (currentIndex + 1) % unreadUsers.length : 0;

    selectUser(unreadUsers[nextIndex]);
  }

  function selectPreviousUser() {
    if (unreadUsers.length === 0) {
      clearSelectedUser();
      showMessage("จดมิเตอร์ครบทุกคนในรอบบิลนี้แล้ว");
      return;
    }

    const currentIndex = selectedUser
      ? unreadUsers.findIndex((user) => user.id === selectedUser.id)
      : -1;

    const previousIndex =
      currentIndex > 0 ? currentIndex - 1 : unreadUsers.length - 1;

    selectUser(unreadUsers[previousIndex]);
  }

  function validateBeforeSave() {
    if (isPeriodLocked) {
      return "รอบบิลนี้ถูกล็อกแล้ว กรุณาไปที่เมนูควบคุมรอบบิลแล้วเปิดรอบเพื่อแก้ไขก่อน";
    }

    if (!selectedUser) {
      return "กรุณาเลือกผู้ใช้น้ำ";
    }

    const isAlreadyRecorded = periodReadings.some(
      (reading) => reading.waterUserId === selectedUser.id
    );

    const isEditingExisting = Boolean(existingReading);

    if (isAlreadyRecorded && !isEditingExisting) {
      return "รายนี้ถูกบันทึกแล้ว ถ้าต้องการแก้ไขให้กดปุ่มแก้ไขจากตารางด้านล่าง";
    }

    if (billingMode === "normal" && currentReadingText.trim() === "") {
      return "กรุณากรอกเลขมิเตอร์ครั้งนี้";
    }

    if (billingMode === "service_only" && serviceFeeText.trim() === "") {
      return "กรุณากรอกค่าบริการ";
    }

    if (
      billingMode === "meter_replaced" &&
      oldMeterFinalReadingText.trim() === ""
    ) {
      return "กรุณากรอกเลขมิเตอร์เก่าตอนถอด";
    }

    if (billingMode === "meter_replaced" && currentReadingText.trim() === "") {
      return "กรุณากรอกเลขมิเตอร์ใหม่ครั้งนี้";
    }

    if (
      billingMode === "meter_replaced" &&
      Number(oldMeterFinalReadingText || 0) < previousReading
    ) {
      return "เลขมิเตอร์เก่าตอนถอดต้องไม่น้อยกว่าเลขครั้งก่อน";
    }

    return "";
  }

  async function handleSaveReading() {
    const validationError = validateBeforeSave();

    if (validationError) {
      showError(validationError);
      return;
    }

    if (!selectedUser) {
      return;
    }

    setIsSaving(true);

    const now = new Date().toISOString();

    const nextReading: MeterReading = {
      id: existingReading?.id || makeReadingId(currentPeriod.id, selectedUser.id),
      periodId: currentPeriod.id,
      waterUserId: selectedUser.id,

      previousReading: calculation.previousReading,
      currentReading: calculation.currentReading,
      usedUnits: calculation.usedUnits,

      unitPrice: calculation.unitPrice,
      waterAmount: calculation.waterAmount,
      serviceFee: calculation.serviceFee,
      totalAmount: calculation.totalAmount,

      billingMode: calculation.billingMode,
      meterStatus: calculation.meterStatus,

      oldMeterFinalReading: calculation.oldMeterFinalReading,
      oldMeterUnits: calculation.oldMeterUnits,
      newMeterUnits: calculation.newMeterUnits,

      isRollover: calculation.isRollover,
      isBackward: calculation.isBackward,
      meterMaxValue: settings.meterMaxValue,

      note:
        note ||
        (billingMode === "service_only"
          ? `เฉพาะค่าบริการ ${calculation.serviceFee} บาท`
          : ""),

      recordedAt: existingReading?.recordedAt || now,
      createdAt: existingReading?.createdAt || now,
      updatedAt: now,
    };

    const nextReadings = [
      ...readings.filter(
        (reading) =>
          !(
            reading.periodId === currentPeriod.id &&
            reading.waterUserId === selectedUser.id
          )
      ),
      nextReading,
    ];

    const shouldUpdateLastReading =
      billingMode === "normal" || billingMode === "meter_replaced";

    const nextUsers: WaterUser[] = users.map((user): WaterUser => {
      if (user.id !== selectedUser.id) {
        return user;
      }

      const nextUserStatus: UserStatusV4 =
        billingMode === "service_only"
          ? "SERVICE_ONLY"
          : billingMode === "disconnected_no_charge"
            ? "CUT"
            : "ACTIVE";

      const nextStatus: UserStatus =
        billingMode === "disconnected_no_charge" ? "cut" : "active";

      return {
        ...user,
        defaultBillingMode: billingMode,
        serviceOnly: billingMode === "service_only",
        cutMeter: billingMode === "disconnected_no_charge",
        serviceFeeOverride:
          billingMode === "service_only"
            ? calculation.serviceFee
            : user.serviceFeeOverride,
        userStatus: nextUserStatus,
        status: nextStatus,
        lastReading: shouldUpdateLastReading
          ? calculation.currentReading
          : user.lastReading,
        lastReadingText: shouldUpdateLastReading
          ? padMeterReading(calculation.currentReading)
          : user.lastReadingText,
        lastRecordDateLabel: currentPeriod.periodName,
        updatedAt: now,
      };
    });

    const nextSelectedUser =
      nextUsers.find((user) => user.id === selectedUser.id) || selectedUser;

    try {
      if (dataSourceMode === "supabase") {
        const response = await fetch("/api/meter-readings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reading: nextReading,
            user: nextSelectedUser,
          }),
        });

        const data = (await response.json()) as MeterReadingApiResponse;

        if (!response.ok || !data.ok) {
          showError(data.error || data.message || "บันทึกจดมิเตอร์เข้า Supabase ไม่สำเร็จ");
          setIsSaving(false);
          return;
        }

        setReadings(data.readings || nextReadings);
        setUsers(data.users || nextUsers);
      } else {
        saveStoredMeterReadings(nextReadings);
        saveStoredWaterUsers(nextUsers);

        setReadings(nextReadings);
        setUsers(nextUsers);
      }

      showMessage(`บันทึก ${selectedUser.fullName} สำเร็จ`);

      window.setTimeout(() => {
        setIsSaving(false);
        setCurrentReadingText("");
        setOldMeterFinalReadingText("");
        setServiceFeeText(String(settings.serviceFee || 0));
        setNote("");

        const latestUsers = dataSourceMode === "supabase" ? nextUsers : nextUsers;
        const latestReadings = dataSourceMode === "supabase" ? nextReadings : nextReadings;

        const nextUnreadUser = sortUsers(latestUsers, userSortMode)
          .filter(isUserActive)
          .find(
            (user) =>
              !latestReadings.some(
                (reading) =>
                  reading.periodId === currentPeriod.id &&
                  reading.waterUserId === user.id
              )
          );

        if (nextUnreadUser) {
          selectUser(nextUnreadUser);
        } else {
          clearSelectedUser();
          showMessage("จดมิเตอร์ครบทุกคนในรอบบิลนี้แล้ว");
        }
      }, 250);
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "บันทึกจดมิเตอร์เข้า Supabase ไม่สำเร็จ"
      );
      setIsSaving(false);
    }
  }

  const modeButtons: Array<{
    mode: BillingMode;
    title: string;
    desc: string;
  }> = [
    {
      mode: "normal",
      title: "ปกติ",
      desc: "คิดค่าน้ำ + ค่าบริการ",
    },
    {
      mode: "service_only",
      title: "เฉพาะค่าบริการ",
      desc: "หน่วย 0 ยอดเท่าค่าบริการ",
    },
    {
      mode: "meter_replaced",
      title: "เปลี่ยนมิเตอร์",
      desc: "เก่า + ใหม่",
    },
    {
      mode: "disconnected_no_charge",
      title: "ตัดมิเตอร์",
      desc: "ไม่คิดเงิน",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 px-4 pb-24 pt-5 text-white">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/10" />

        <div className="relative mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href="/" className="text-sm font-bold text-blue-100">
                ← กลับหน้าหลัก
              </Link>

              <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight">
                จดมิเตอร์น้ำ
              </h1>

              <p className="mt-1 text-sm text-blue-100">
                {currentPeriod.periodName} · รองรับ V4 Billing Mode
              </p>
            </div>

            <Link
              href="/reports"
              className="rounded-2xl border border-white/30 bg-white/15 px-4 py-2 text-xs font-black text-white shadow-sm backdrop-blur"
            >
              รายงาน
            </Link>
          </div>

          <div className="mt-6 rounded-3xl border border-white/25 bg-white/15 p-5 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-blue-100">ความคืบหน้า</p>
                <p className="mt-1 text-3xl font-black">
                  {formatThaiNumber(completedCount)} /{" "}
                  {formatThaiNumber(totalCount)}
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm text-blue-100">เหลือ</p>
                <p className="mt-1 text-3xl font-black">
                  {formatThaiNumber(remainingCount)}
                </p>
              </div>
            </div>

            <div className="mt-4 h-3 rounded-full bg-white/20">
              <div
                className="h-3 rounded-full bg-white"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto -mt-16 max-w-6xl px-4">
        <div className="mb-4 rounded-3xl border border-violet-200 bg-violet-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-violet-600">
                แหล่งข้อมูลที่ใช้กับหน้าจดมิเตอร์
              </p>
              <p className="mt-1 text-xl font-black text-violet-950">
                {getDataSourceModeLabel(dataSourceMode)}
              </p>
              <p className="mt-1 text-xs font-bold text-violet-600">
                {dataSourceMode === "supabase"
                  ? "อ่าน/บันทึกรายการจดมิเตอร์จาก Supabase"
                  : "อ่าน/บันทึกรายการจดมิเตอร์จาก Browser เครื่องนี้"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {dataSourceMode === "supabase" ? (
                <button
                  onClick={() => void loadSupabaseMeterData()}
                  disabled={isLoadingData}
                  className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white"
                >
                  {isLoadingData ? "กำลังโหลด..." : "โหลดจาก Supabase"}
                </button>
              ) : null}

              <Link
                href="/data-source"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-violet-700 ring-1 ring-violet-200"
              >
                เปลี่ยนแหล่งข้อมูล
              </Link>
            </div>
          </div>
        </div>

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
                  ไม่สามารถจดน้ำหรือแก้ไขรายการได้ จนกว่าจะเปิดรอบเพื่อแก้ไข
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

        {isLoadingData ? (
          <div className="mb-4 rounded-3xl bg-white p-6 text-center font-black text-slate-500 shadow-sm ring-1 ring-slate-200">
            กำลังโหลดข้อมูลจดมิเตอร์...
          </div>
        ) : null}

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto_auto] md:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm font-black text-slate-700">
                  ค้นหาผู้ใช้น้ำที่ยังไม่จด
                </label>

                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
                  แสดงเฉพาะคนที่ยังไม่จด
                </span>
              </div>

              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="ค้นหา รหัส / ชื่อ / บ้าน / หมู่"
                className="mt-2 w-full rounded-2xl border border-slate-200 px-5 py-4 text-lg outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-sm font-black text-slate-700">
                เรียงรายชื่อ
              </label>

              <select
                value={userSortMode}
                onChange={(event) =>
                  handleUserSortModeChange(event.target.value as UserSortMode)
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-black text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="userCode">เรียงจากรหัสผู้ใช้น้ำ</option>
                <option value="address">เรียงจากบ้านเลขที่</option>
              </select>
            </div>

            <button
              onClick={selectPreviousUser}
              className="rounded-2xl border border-blue-200 px-5 py-4 font-black text-blue-700"
            >
              ← รายก่อนหน้า
            </button>

            <button
              onClick={selectNextUser}
              className="rounded-2xl bg-blue-600 px-5 py-4 font-black text-white shadow"
            >
              รายถัดไป →
            </button>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
            ยังไม่จด {unreadUsers.length.toLocaleString("th-TH")} ราย /
            ทั้งหมด {activeUsers.length.toLocaleString("th-TH")} ราย
            {unreadUsers.length > 0
              ? " · ช่องบันทึกด้านล่างจะเลือกคนแรกตามลำดับที่เลือกอัตโนมัติ"
              : ""}
          </div>

          <div className="mt-3 max-h-56 overflow-auto rounded-2xl border border-slate-200">
            {filteredUsers.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-lg font-black text-slate-800">
                  {unreadUsers.length === 0
                    ? "จดมิเตอร์ครบทุกคนแล้ว"
                    : "ไม่พบผู้ใช้น้ำ"}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {unreadUsers.length === 0
                    ? "ถ้าต้องการแก้ไข ให้กดปุ่มแก้ไขจากตารางรายการที่จดแล้วด้านล่าง"
                    : "ลองค้นหาด้วยรหัส ชื่อ หรือบ้าน/รหัสอีกครั้ง"}
                </p>
              </div>
            ) : (
              filteredUsers.slice(0, 80).map((user) => {
                const isSelected = user.id === selectedUserId;

                return (
                  <button
                    key={user.id}
                    onClick={() => selectUser(user)}
                    className={
                      isSelected
                        ? "flex w-full items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3 text-left"
                        : "flex w-full items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 text-left hover:bg-slate-50"
                    }
                  >
                    <div className="min-w-0">
                      <p className="font-black text-slate-900">
                        {user.userCode} · {user.fullName}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        บ้านเลขที่ {user.address || "-"} · หมู่{" "}
                        {user.villageNo || "-"} · เลขล่าสุด{" "}
                        {padMeterReading(user.lastReading)}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
                      ยังไม่จด
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <p className="mt-3 text-xs font-bold text-slate-500">
            ตอนนี้เรียงตาม:{" "}
            {userSortMode === "userCode" ? "รหัสผู้ใช้น้ำ" : "บ้านเลขที่"}
          </p>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          {!selectedUser ? (
            <div className="py-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-3xl">
                💧
              </div>

              <h2 className="mt-4 text-2xl font-black text-slate-900">
                {unreadUsers.length === 0
                  ? "จดมิเตอร์ครบทุกคนแล้ว"
                  : "เลือกผู้ใช้น้ำก่อน"}
              </h2>

              <p className="mt-2 text-sm font-bold text-slate-500">
                {unreadUsers.length === 0
                  ? "ถ้าต้องการแก้ไข ให้กดปุ่มแก้ไขจากตารางรายการที่จดแล้วด้านล่าง"
                  : "เลือกรายชื่อจากรายการด้านบนเพื่อเริ่มจดมิเตอร์"}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-blue-700">
                    รายที่ {selectedUserIndex + 1} จาก {activeUsers.length}
                  </p>

                  <h2 className="mt-1 text-2xl font-black text-slate-900">
                    {selectedUser.fullName}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    รหัส {selectedUser.userCode} · บ้าน/รหัส{" "}
                    {selectedUser.address || "-"} · หมู่{" "}
                    {selectedUser.villageNo || "-"}
                  </p>
                </div>

                {existingReading ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                    โหมดแก้ไขรายการเดิม
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
                    ยังไม่บันทึก
                  </span>
                )}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {modeButtons.map((item) => (
                  <button
                    key={item.mode}
                    onClick={() => {
                      if (isPeriodLocked) {
                        showError("รอบบิลถูกล็อกแล้ว เปิดรอบเพื่อแก้ไขก่อน");
                        return;
                      }

                      setBillingMode(item.mode);

                      if (
                        item.mode === "service_only" ||
                        item.mode === "disconnected_no_charge"
                      ) {
                        setCurrentReadingText("");
                      }

                      if (item.mode === "service_only") {
                        setServiceFeeText(
                          String(getUserServiceFee(selectedUser, settings))
                        );
                      }

                      if (item.mode === "meter_replaced") {
                        setOldMeterFinalReadingText(String(previousReading));
                      }
                    }}
                    className={
                      billingMode === item.mode
                        ? "rounded-3xl bg-blue-600 p-4 text-left text-white shadow"
                        : "rounded-3xl bg-slate-50 p-4 text-left text-slate-700 ring-1 ring-slate-200"
                    }
                  >
                    <p className="font-black">{item.title}</p>
                    <p
                      className={
                        billingMode === item.mode
                          ? "mt-1 text-xs text-blue-100"
                          : "mt-1 text-xs text-slate-500"
                      }
                    >
                      {item.desc}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-lg font-black text-slate-900">
                    ข้อมูลมิเตอร์
                  </h3>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-black text-slate-600">
                        เลขครั้งก่อน
                      </label>

                      <input
                        value={padMeterReading(previousReading)}
                        readOnly
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-right text-2xl font-black text-slate-500"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-black text-slate-600">
                        เลขครั้งนี้
                      </label>

                      <input
                        value={
                          billingMode === "service_only" ||
                          billingMode === "disconnected_no_charge"
                            ? padMeterReading(previousReading)
                            : currentReadingText
                        }
                        onChange={(event) =>
                          setCurrentReadingText(event.target.value)
                        }
                        readOnly={
                          isPeriodLocked ||
                          billingMode === "service_only" ||
                          billingMode === "disconnected_no_charge"
                        }
                        inputMode="numeric"
                        placeholder="0000"
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-right text-2xl font-black text-blue-700 outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {billingMode === "service_only" ? (
                    <div className="mt-4 rounded-3xl border border-orange-200 bg-orange-50 p-4">
                      <label className="text-sm font-black text-orange-800">
                        ค่าบริการเฉพาะรายนี้
                      </label>

                      <input
                        value={serviceFeeText}
                        onChange={(event) => setServiceFeeText(event.target.value)}
                        readOnly={isPeriodLocked}
                        inputMode="decimal"
                        placeholder="เช่น 15"
                        className="mt-2 w-full rounded-2xl border border-orange-200 bg-white px-4 py-4 text-right text-2xl font-black text-orange-700 outline-none focus:border-orange-500"
                      />

                      <p className="mt-2 text-xs font-bold text-orange-800">
                        ช่องนี้แก้ไขได้เฉพาะคนที่เลือก “เฉพาะค่าบริการ”
                      </p>
                    </div>
                  ) : null}

                  {billingMode === "meter_replaced" ? (
                    <div className="mt-4 rounded-3xl border border-orange-200 bg-orange-50 p-4">
                      <label className="text-sm font-black text-orange-800">
                        เลขมิเตอร์เก่าตอนถอด
                      </label>

                      <input
                        value={oldMeterFinalReadingText}
                        onChange={(event) =>
                          setOldMeterFinalReadingText(event.target.value)
                        }
                        readOnly={isPeriodLocked}
                        inputMode="numeric"
                        placeholder="เช่น 5610"
                        className="mt-2 w-full rounded-2xl border border-orange-200 bg-white px-4 py-4 text-right text-2xl font-black text-orange-700 outline-none focus:border-orange-500"
                      />

                      {canShowSummaryAmounts ? (
                        <p className="mt-2 text-sm font-bold text-orange-800">
                          หน่วยเก่า{" "}
                          {formatThaiNumber(calculation.oldMeterUnits || 0)} +
                          หน่วยใหม่{" "}
                          {formatThaiNumber(calculation.newMeterUnits || 0)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <label className="text-sm font-black text-slate-600">
                      หมายเหตุ
                    </label>

                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      readOnly={isPeriodLocked}
                      placeholder="เช่น เปลี่ยนมิเตอร์ / บ้านปิด / อ่านเลขยาก"
                      className="mt-2 min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
                  <h3 className="text-lg font-black text-blue-900">
                    สรุปยอดทันที
                  </h3>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs font-bold text-slate-500">
                        ประเภทบิล
                      </p>
                      <p className="mt-1 font-black text-slate-900">
                        {getBillingModeLabel(calculation.billingMode)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs font-bold text-slate-500">
                        สถานะมิเตอร์
                      </p>
                      <p className="mt-1 font-black text-slate-900">
                        {canShowSummaryAmounts
                          ? getMeterStatusLabel(calculation.meterStatus)
                          : "รอกรอกเลขปัจจุบัน"}
                      </p>
                    </div>

                    {canShowSummaryAmounts ? (
                      <>
                        <div className="rounded-2xl bg-white p-4">
                          <p className="text-xs font-bold text-slate-500">
                            หน่วยที่ใช้
                          </p>
                          <p className="mt-1 text-2xl font-black text-blue-700">
                            {formatThaiNumber(calculation.usedUnits)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-white p-4">
                          <p className="text-xs font-bold text-slate-500">
                            หน่วยละ
                          </p>
                          <p className="mt-1 text-2xl font-black text-slate-900">
                            {formatThaiCurrency(calculation.unitPrice)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-white p-4">
                          <p className="text-xs font-bold text-slate-500">
                            ค่าน้ำ
                          </p>
                          <p className="mt-1 text-2xl font-black text-slate-900">
                            {formatThaiCurrency(calculation.waterAmount)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-white p-4">
                          <p className="text-xs font-bold text-slate-500">
                            ค่าบริการ
                          </p>
                          <p className="mt-1 text-2xl font-black text-orange-700">
                            {formatThaiCurrency(calculation.serviceFee)}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2 rounded-2xl border border-dashed border-blue-200 bg-white p-5 text-center">
                        <p className="text-sm font-bold text-slate-500">
                          ยังไม่แสดงหน่วยที่ใช้ ค่าน้ำ และยอดรวม
                        </p>

                        <p className="mt-1 text-lg font-black text-blue-700">
                          กรอกเลขมิเตอร์ปัจจุบันก่อน
                        </p>
                      </div>
                    )}
                  </div>

                  {canShowSummaryAmounts ? (
                    <div className="mt-4 rounded-3xl bg-blue-600 p-5 text-white shadow">
                      <p className="text-sm font-bold text-blue-100">
                        รวมเงินทั้งสิ้น
                      </p>

                      <p className="mt-1 text-4xl font-black">
                        {formatThaiCurrency(calculation.totalAmount)}
                      </p>

                      <p className="mt-2 text-sm text-blue-100">
                        {calculation.message}
                      </p>
                    </div>
                  ) : null}

                  <button
                    onClick={() => void handleSaveReading()}
                    disabled={isSaving || isPeriodLocked || isLoadingData}
                    className={
                      isSaving || isPeriodLocked || isLoadingData
                        ? "mt-4 w-full rounded-3xl bg-slate-400 px-5 py-5 text-lg font-black text-white"
                        : "mt-4 w-full rounded-3xl bg-emerald-600 px-5 py-5 text-lg font-black text-white shadow"
                    }
                  >
                    {isPeriodLocked
                      ? "รอบบิลถูกล็อกแล้ว"
                      : isLoadingData
                        ? "กำลังโหลดข้อมูล..."
                        : isSaving
                          ? "กำลังบันทึก..."
                          : existingReading
                            ? "บันทึกการแก้ไข"
                            : "บันทึกแล้วไปรายถัดไป"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-900">
              รายการที่จดแล้ว
            </h2>

            <p className="text-sm font-bold text-slate-500">
              {periodReadings.length.toLocaleString("th-TH")} รายการ
            </p>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3 text-right">ก่อน</th>
                  <th className="px-4 py-3 text-right">หลัง</th>
                  <th className="px-4 py-3 text-right">หน่วย</th>
                  <th className="px-4 py-3 text-right">รวม</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">จัดการ</th>
                </tr>
              </thead>

              <tbody>
                {periodReadings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      ยังไม่มีรายการจดมิเตอร์ในรอบนี้
                    </td>
                  </tr>
                ) : (
                  periodReadings.map((reading) => {
                    const user = users.find(
                      (item) => item.id === reading.waterUserId
                    );

                    return (
                      <tr
                        key={`${reading.periodId}-${reading.waterUserId}`}
                        className="border-t border-slate-100"
                      >
                        <td className="px-4 py-3 font-black">
                          {user?.userCode || "-"}
                        </td>

                        <td className="px-4 py-3">
                          {user?.fullName || "ไม่พบผู้ใช้น้ำ"}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {padMeterReading(reading.previousReading)}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {padMeterReading(reading.currentReading)}
                        </td>

                        <td className="px-4 py-3 text-right font-black">
                          {formatThaiNumber(reading.usedUnits || 0)}
                        </td>

                        <td className="px-4 py-3 text-right font-black text-blue-700">
                          {formatThaiCurrency(reading.totalAmount || 0)}
                        </td>

                        <td className="px-4 py-3">
                          {getBillingModeLabel(reading.billingMode || "normal")}
                        </td>

                        <td className="px-4 py-3">
                          {user ? (
                            <button
                              onClick={() => selectUser(user)}
                              className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
                            >
                              แก้ไข
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
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
            href="/meter-reading"
            className="rounded-2xl bg-blue-50 px-2 py-2 font-black text-blue-700"
          >
            <div className="text-lg">💧</div>
            จดน้ำ
          </Link>

          <Link
            href="/payments"
            className="rounded-2xl px-2 py-2 font-bold text-slate-500"
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
