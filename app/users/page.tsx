"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getStoredSettings,
  getStoredWaterUsers,
  resetStoredWaterUsers,
  saveStoredWaterUsers,
  upsertStoredWaterUser,
} from "../../lib/local-store";
import {
  getDataSourceMode,
  getDataSourceModeLabel,
  type DataSourceMode,
} from "../../lib/data-source";
import {
  waterSettings as defaultWaterSettings,
  waterUsers as defaultWaterUsers,
} from "../../lib/mock-data";
import type { WaterSettings, WaterUser } from "../../types/water-system";

interface UsersApiResponse {
  ok: boolean;
  message?: string;
  error?: string;
  users?: WaterUser[];
}

const blankUser: WaterUser = {
  id: "",
  userCode: "",
  fullName: "",
  address: "",
  villageNo: "",
  phone: "",
  status: "active",
  serviceOnly: false,
  serviceFeeOverride: null,
  cutMeter: false,
  lastReading: 0,
  createdAt: "",
  updatedAt: "",
};

function formatMoney(value: number) {
  return `${Number(value || 0).toLocaleString("th-TH")} บาท`;
}

type UserTableFilterMode = "sequence" | "userCode" | "fullName" | "type";

function getUserTypeLabel(user: WaterUser) {
  if (user.cutMeter || user.status === "cut" || user.userStatus === "CUT") {
    return "ตัดมิเตอร์";
  }

  if (
    user.serviceOnly ||
    user.userStatus === "SERVICE_ONLY" ||
    user.defaultBillingMode === "service_only"
  ) {
    return "เฉพาะค่าบริการ";
  }

  return "ใช้งาน";
}

function getUserFilterValue(
  user: WaterUser,
  index: number,
  mode: UserTableFilterMode
) {
  if (mode === "sequence") {
    return String(index + 1);
  }

  if (mode === "fullName") {
    return user.fullName || "";
  }

  if (mode === "type") {
    return getUserTypeLabel(user);
  }

  return user.userCode || "";
}

function compareUserByMode(
  a: WaterUser,
  b: WaterUser,
  mode: UserTableFilterMode
) {
  if (mode === "sequence") {
    return 0;
  }

  if (mode === "fullName") {
    return (
      String(a.fullName || "").localeCompare(String(b.fullName || ""), "th", {
        numeric: true,
        sensitivity: "base",
      }) ||
      String(a.userCode || "").localeCompare(String(b.userCode || ""), "th", {
        numeric: true,
        sensitivity: "base",
      })
    );
  }

  if (mode === "type") {
    return (
      getUserTypeLabel(a).localeCompare(getUserTypeLabel(b), "th", {
        numeric: true,
        sensitivity: "base",
      }) ||
      String(a.userCode || "").localeCompare(String(b.userCode || ""), "th", {
        numeric: true,
        sensitivity: "base",
      })
    );
  }

  return (
    String(a.userCode || "").localeCompare(String(b.userCode || ""), "th", {
      numeric: true,
      sensitivity: "base",
    }) ||
    String(a.fullName || "").localeCompare(String(b.fullName || ""), "th", {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function getFilterPlaceholder(mode: UserTableFilterMode) {
  if (mode === "sequence") {
    return "ค้นหาลำดับ เช่น 1, 2, 10";
  }

  if (mode === "fullName") {
    return "ค้นหาชื่อ - สกุล";
  }

  if (mode === "type") {
    return "ค้นหาประเภท เช่น ใช้งาน / เฉพาะค่าบริการ / ตัดมิเตอร์";
  }

  return "ค้นหารหัส เช่น WC-O-001";
}

const USER_CODE_PREFIX = "WC-O-";

function extractUserCodeNumber(userCode: string | undefined | null) {
  const code = String(userCode || "").trim().toUpperCase();

  const prefixedMatch = code.match(/^WC-O-(\d+)$/);
  if (prefixedMatch) {
    return Number(prefixedMatch[1]);
  }

  const trailingNumberMatch = code.match(/(\d+)$/);
  if (trailingNumberMatch) {
    return Number(trailingNumberMatch[1]);
  }

  return 0;
}

function formatAutoUserCode(numberValue: number) {
  return `${USER_CODE_PREFIX}${String(numberValue).padStart(3, "0")}`;
}

function getNextUserCode(users: WaterUser[]) {
  const maxNumber = users.reduce((maxValue, user) => {
    const numberValue = extractUserCodeNumber(user.userCode);

    return numberValue > maxValue ? numberValue : maxValue;
  }, 0);

  return formatAutoUserCode(maxNumber + 1);
}

function isUserCodeTaken(
  users: WaterUser[],
  userCode: string,
  currentUserId?: string
) {
  const normalizedCode = userCode.trim().toUpperCase();

  return users.some(
    (user) =>
      user.id !== currentUserId &&
      String(user.userCode || "").trim().toUpperCase() === normalizedCode
  );
}

function createBlankUser(userCode = ""): WaterUser {
  return { ...blankUser, userCode };
}

function getLocalUsersWithFallback() {
  const storedUsers = getStoredWaterUsers();

  return storedUsers.length > 0 ? storedUsers : defaultWaterUsers;
}

export default function UsersPage() {
  const [users, setUsers] = useState<WaterUser[]>(defaultWaterUsers);
  const [settings, setSettings] = useState<WaterSettings>(
    defaultWaterSettings
  );

  const [form, setForm] = useState<WaterUser>(() =>
    createBlankUser(getNextUserCode(defaultWaterUsers))
  );
  const [keyword, setKeyword] = useState("");
  const [filterMode, setFilterMode] = useState<UserTableFilterMode>("userCode");
  const [message, setMessage] = useState("");
  const [dataSourceMode, setDataSourceMode] =
    useState<DataSourceMode>("localStorage");
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);

  useEffect(() => {
    const mode = getDataSourceMode();

    setDataSourceMode(mode);
    setSettings(getStoredSettings());

    if (mode === "supabase") {
      void loadSupabaseUsers();
      return;
    }

    const storedUsers = getLocalUsersWithFallback();

    setUsers(storedUsers);
    setForm((currentForm) =>
      currentForm.id || currentForm.userCode
        ? currentForm
        : createBlankUser(getNextUserCode(storedUsers))
    );
  }, []);

  const summary = useMemo(() => {
    const total = users.length;
    const active = users.filter(
      (user) => !user.cutMeter && user.status !== "cut"
    ).length;
    const cut = users.filter(
      (user) => user.cutMeter || user.status === "cut"
    ).length;
    const serviceOnly = users.filter(
      (user) => user.serviceOnly && !user.cutMeter
    ).length;

    return { total, active, cut, serviceOnly };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    const indexedUsers = users.map((user, index) => ({ user, index }));

    const matchedUsers = query
      ? indexedUsers.filter(({ user, index }) =>
          getUserFilterValue(user, index, filterMode)
            .toLowerCase()
            .includes(query)
        )
      : indexedUsers;

    return matchedUsers
      .sort((a, b) => {
        if (filterMode === "sequence") {
          return a.index - b.index;
        }

        return compareUserByMode(a.user, b.user, filterMode);
      })
      .map(({ user }) => user);
  }, [users, keyword, filterMode]);

  const nextAutoUserCode = useMemo(() => getNextUserCode(users), [users]);

  async function loadSupabaseUsers() {
    setIsLoadingUsers(true);

    try {
      const response = await fetch("/api/users", {
        cache: "no-store",
      });

      const data = (await response.json()) as UsersApiResponse;

      if (!response.ok || !data.ok) {
        showMessage(data.error || data.message || "โหลดรายชื่อจาก Supabase ไม่สำเร็จ");
        return;
      }

      const nextUsers = data.users || [];

      setUsers(nextUsers);
      setForm((currentForm) =>
        currentForm.id || currentForm.userCode
          ? currentForm
          : createBlankUser(getNextUserCode(nextUsers))
      );
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "โหลดรายชื่อจาก Supabase ไม่สำเร็จ"
      );
    } finally {
      setIsLoadingUsers(false);
    }
  }

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

  function resetForm(sourceUsers = users) {
    setForm(createBlankUser(getNextUserCode(sourceUsers)));
  }

  async function handleSaveUser() {
    const originalUser = form.id
      ? users.find((user) => user.id === form.id)
      : undefined;

    const finalUserCode = form.id
      ? String(originalUser?.userCode || form.userCode).trim()
      : form.userCode.trim() || nextAutoUserCode;

    if (!finalUserCode) {
      showMessage("ระบบยังสร้างรหัสผู้ใช้น้ำไม่ได้");
      return;
    }

    if (isUserCodeTaken(users, finalUserCode, form.id || undefined)) {
      showMessage(`รหัส ${finalUserCode} ถูกใช้แล้ว`);
      return;
    }

    if (!form.fullName.trim()) {
      showMessage("กรุณากรอกชื่อ-สกุล");
      return;
    }

    const now = new Date().toISOString();
    const serviceFeeOverride = Number(form.serviceFeeOverride ?? 0);

    const userToSave: WaterUser = {
      ...form,
      id: form.id || `user-${Date.now()}`,
      userCode: finalUserCode,
      fullName: form.fullName.trim(),
      address: form.address.trim(),
      villageNo: form.villageNo.trim(),
      phone: form.phone?.trim() || "",
      status: form.cutMeter ? "cut" : "active",
      userStatus: form.cutMeter
        ? "CUT"
        : form.serviceOnly
          ? "SERVICE_ONLY"
          : "ACTIVE",
      defaultBillingMode: form.serviceOnly ? "service_only" : "normal",
      serviceOnly: Boolean(form.serviceOnly),
      serviceFeeOverride:
        form.serviceOnly && serviceFeeOverride > 0 ? serviceFeeOverride : null,
      cutMeter: Boolean(form.cutMeter),
      lastReading: Number(form.lastReading) || 0,
      createdAt: form.createdAt || now,
      updatedAt: now,
    };

    setIsSavingUser(true);

    try {
      if (dataSourceMode === "supabase") {
        const response = await fetch("/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(userToSave),
        });

        const data = (await response.json()) as UsersApiResponse;

        if (!response.ok || !data.ok) {
          showMessage(data.error || data.message || "บันทึกเข้า Supabase ไม่สำเร็จ");
          return;
        }

        const nextUsers = data.users || users;

        setUsers(nextUsers);
        resetForm(nextUsers);
        showMessage(`บันทึกข้อมูลผู้ใช้น้ำเข้า Supabase แล้ว (${finalUserCode})`);
        return;
      }

      const updatedUsers = upsertStoredWaterUser(userToSave);

      setUsers(updatedUsers);
      resetForm(updatedUsers);
      showMessage(`บันทึกข้อมูลผู้ใช้น้ำแล้ว (${finalUserCode})`);
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "บันทึกข้อมูลผู้ใช้น้ำไม่สำเร็จ"
      );
    } finally {
      setIsSavingUser(false);
    }
  }

  function handleEditUser(user: WaterUser) {
    setForm({
      ...user,
      serviceFeeOverride: user.serviceOnly
        ? user.serviceFeeOverride ?? settings.serviceFee
        : null,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteUser(user: WaterUser) {
    const ok = window.confirm(`ต้องการลบ ${user.fullName} ใช่ไหม?`);

    if (!ok) {
      return;
    }

    const updatedUsers = users.filter((item) => item.id !== user.id);

    if (dataSourceMode === "supabase") {
      const response = await fetch("/api/users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: user.id }),
      });

      const data = (await response.json()) as UsersApiResponse;

      if (!response.ok || !data.ok) {
        showMessage(data.error || data.message || "ลบผู้ใช้น้ำจาก Supabase ไม่สำเร็จ");
        return;
      }

      const nextUsers = data.users || updatedUsers;

      setUsers(nextUsers);

      if (form.id === user.id) {
        resetForm(nextUsers);
      }

      showMessage("ลบผู้ใช้น้ำจาก Supabase แล้ว");
      return;
    }

    saveStoredWaterUsers(updatedUsers);
    setUsers(updatedUsers);

    if (form.id === user.id) {
      resetForm(updatedUsers);
    }

    showMessage("ลบผู้ใช้น้ำแล้ว");
  }

  function handleResetUsers() {
    if (dataSourceMode === "supabase") {
      void loadSupabaseUsers();
      showMessage("โหลดรายชื่อจาก Supabase ใหม่แล้ว");
      return;
    }

    const ok = window.confirm("ต้องการคืนค่ารายชื่อผู้ใช้น้ำเริ่มต้นใช่ไหม?");

    if (!ok) {
      return;
    }

    resetStoredWaterUsers();

    const storedUsers = getStoredWaterUsers();

    setUsers(storedUsers);
    resetForm(storedUsers);
    showMessage("คืนค่ารายชื่อเริ่มต้นแล้ว");
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-900 to-cyan-700 px-4 pb-28 pt-5 text-white">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute -bottom-28 -left-24 h-80 w-80 rounded-full bg-blue-400/20 blur-3xl" />

        <div className="relative mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/" className="text-sm font-bold text-blue-100">
                ← กลับหน้าหลัก
              </Link>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/15 text-2xl shadow-sm ring-1 ring-white/20 backdrop-blur">
                  👥
                </div>

                <div>
                  <h1 className="text-4xl font-black leading-tight tracking-tight">
                    ผู้ใช้น้ำ
                  </h1>

                  <p className="mt-1 text-sm font-bold text-blue-100">
                    จัดการรายชื่อผู้ใช้น้ำ สถานะมิเตอร์ และค่าบริการเฉพาะราย
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/data-source"
                className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-sm font-black text-white shadow-sm backdrop-blur hover:bg-white/20"
              >
                เปลี่ยนแหล่งข้อมูล
              </Link>

              <Link
                href="/"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-900 shadow-sm"
              >
                หน้าแรก
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto -mt-20 max-w-6xl px-4">
        <div className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-slate-200">
          <div className="border-b border-slate-100 bg-gradient-to-r from-white via-slate-50 to-blue-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div
                  className={
                    dataSourceMode === "supabase"
                      ? "flex h-14 w-14 items-center justify-center rounded-3xl bg-violet-100 text-2xl font-black text-violet-700"
                      : "flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-100 text-2xl font-black text-emerald-700"
                  }
                >
                  {dataSourceMode === "supabase" ? "S" : "L"}
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
                    Users Data Source
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-black text-slate-950">
                      {getDataSourceModeLabel(dataSourceMode)}
                    </h2>

                    <span
                      className={
                        dataSourceMode === "supabase"
                          ? "rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700"
                          : "rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700"
                      }
                    >
                      {dataSourceMode === "supabase" ? "Online Database" : "Local Browser"}
                    </span>
                  </div>

                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {dataSourceMode === "supabase"
                      ? "รายชื่อนี้อ่านและบันทึกผ่านฐานข้อมูล Supabase"
                      : "รายชื่อนี้อ่านและบันทึกใน Browser เครื่องนี้"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {dataSourceMode === "supabase" ? (
                  <button
                    onClick={() => void loadSupabaseUsers()}
                    disabled={isLoadingUsers}
                    className={
                      isLoadingUsers
                        ? "rounded-2xl bg-slate-300 px-5 py-3 text-sm font-black text-white"
                        : "rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-violet-700"
                    }
                  >
                    {isLoadingUsers ? "กำลังโหลด..." : "โหลดจาก Supabase"}
                  </button>
                ) : null}

                <Link
                  href="/data-source"
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
                >
                  ตั้งค่าแหล่งข้อมูล
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-slate-100 md:grid-cols-4 md:divide-x md:divide-y-0">
            <div className="bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-500">ทั้งหมด</p>
                  <p className="mt-3 text-4xl font-black tracking-tight text-slate-950">
                    {summary.total.toLocaleString("th-TH")}
                  </p>
                </div>

                <div className="rounded-2xl bg-blue-50 px-3 py-2 text-sm font-black text-blue-700">
                  TOTAL
                </div>
              </div>

              <div className="mt-5 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 w-full rounded-full bg-blue-500" />
              </div>
            </div>

            <div className="bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-500">ใช้งาน</p>
                  <p className="mt-3 text-4xl font-black tracking-tight text-slate-950">
                    {summary.active.toLocaleString("th-TH")}
                  </p>
                </div>

                <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
                  ACTIVE
                </div>
              </div>

              <div className="mt-5 h-1.5 rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-emerald-500"
                  style={{
                    width:
                      summary.total === 0
                        ? "0%"
                        : `${Math.round((summary.active / summary.total) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-500">
                    ค่าบริการ
                  </p>
                  <p className="mt-3 text-4xl font-black tracking-tight text-slate-950">
                    {summary.serviceOnly.toLocaleString("th-TH")}
                  </p>
                </div>

                <div className="rounded-2xl bg-orange-50 px-3 py-2 text-sm font-black text-orange-700">
                  FEE
                </div>
              </div>

              <div className="mt-5 h-1.5 rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-orange-500"
                  style={{
                    width:
                      summary.total === 0
                        ? "0%"
                        : `${Math.round((summary.serviceOnly / summary.total) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-500">
                    ตัดมิเตอร์
                  </p>
                  <p className="mt-3 text-4xl font-black tracking-tight text-slate-950">
                    {summary.cut.toLocaleString("th-TH")}
                  </p>
                </div>

                <div className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-black text-red-700">
                  CUT
                </div>
              </div>

              <div className="mt-5 h-1.5 rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-red-500"
                  style={{
                    width:
                      summary.total === 0
                        ? "0%"
                        : `${Math.round((summary.cut / summary.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center font-black text-emerald-700 shadow-sm">
            {message}
          </div>
        ) : null}

        <section className="mt-5 overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white p-5">
            <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">
                {form.id ? "แก้ไขผู้ใช้น้ำ" : "เพิ่มผู้ใช้น้ำ"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                กรอกข้อมูลให้ครบ แล้วกดบันทึก
              </p>
            </div>

            {form.id ? (
              <button
                onClick={() => resetForm()}
                className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-600"
              >
                ยกเลิก
              </button>
            ) : null}
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveUser();
            }}
            className="grid gap-3 p-5"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-bold text-slate-600">
                  รหัสผู้ใช้น้ำ
                </label>
                <input
                  value={form.id ? form.userCode : form.userCode || nextAutoUserCode}
                  readOnly
                  placeholder="เช่น WC-O-001"
                  className={
                    form.id
                      ? "mt-2 w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-lg font-black text-slate-500 outline-none"
                      : "mt-2 w-full cursor-not-allowed rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-lg font-black text-blue-700 outline-none"
                  }
                />
                <p
                  className={
                    form.id
                      ? "mt-1 text-xs font-bold text-slate-500"
                      : "mt-1 text-xs font-bold text-blue-600"
                  }
                >
                  {form.id
                    ? "รหัสผู้ใช้น้ำถูกล็อก ไม่สามารถแก้ไขได้"
                    : "ระบบสร้างให้อัตโนมัติจากเลขล่าสุด"}
                </p>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-600">หมู่</label>
                <input
                  value={form.villageNo}
                  onChange={(event) =>
                    setForm({ ...form, villageNo: event.target.value })
                  }
                  placeholder="เช่น 1"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg font-bold outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-600">
                ชื่อ - สกุล
              </label>
              <input
                value={form.fullName}
                onChange={(event) =>
                  setForm({ ...form, fullName: event.target.value })
                }
                placeholder="ชื่อผู้ใช้น้ำ"
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg font-bold outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-bold text-slate-600">
                  บ้านเลขที่
                </label>
                <input
                  value={form.address}
                  onChange={(event) =>
                    setForm({ ...form, address: event.target.value })
                  }
                  placeholder="เช่น 12"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-600">
                  เบอร์โทร
                </label>
                <input
                  value={form.phone || ""}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  placeholder="ไม่บังคับ"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-600">
                เลขมิเตอร์ล่าสุด
              </label>
              <input
                type="number"
                value={form.lastReading}
                onChange={(event) =>
                  setForm({ ...form, lastReading: Number(event.target.value) })
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg font-bold outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-black text-orange-700">
                <input
                  type="checkbox"
                  checked={form.serviceOnly}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      serviceOnly: event.target.checked,
                      serviceFeeOverride: event.target.checked
                        ? form.serviceFeeOverride ?? settings.serviceFee
                        : null,
                    })
                  }
                  className="mr-2"
                />
                เฉพาะค่าบริการ
              </label>

              <label className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">
                <input
                  type="checkbox"
                  checked={form.cutMeter}
                  onChange={(event) =>
                    setForm({ ...form, cutMeter: event.target.checked })
                  }
                  className="mr-2"
                />
                ตัดมิเตอร์
              </label>
            </div>

            {form.serviceOnly ? (
              <div className="rounded-3xl border border-orange-200 bg-orange-50 p-5">
                <label className="text-sm font-black text-orange-800">
                  ค่าบริการเฉพาะรายนี้
                </label>

                <input
                  type="number"
                  value={form.serviceFeeOverride ?? settings.serviceFee}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      serviceFeeOverride: Number(event.target.value) || 0,
                    })
                  }
                  className="mt-2 w-full rounded-2xl border border-orange-200 bg-white px-4 py-4 text-2xl font-black text-orange-700 outline-none"
                  placeholder={`ค่าเริ่มต้น ${settings.serviceFee} บาท`}
                />

                <p className="mt-2 text-xs leading-5 text-orange-700">
                  ถ้าไม่กรอกหรือกรอก 0 ระบบจะใช้ค่าบริการกลาง{" "}
                  {formatMoney(settings.serviceFee)}
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="submit"
                disabled={isSavingUser}
                className={
                  isSavingUser
                    ? "rounded-2xl bg-slate-300 px-5 py-4 text-lg font-black text-white"
                    : "rounded-2xl bg-blue-600 px-5 py-4 text-lg font-black text-white shadow"
                }
              >
                {isSavingUser ? "กำลังบันทึก..." : "บันทึก"}
              </button>

              <button
                type="button"
                onClick={() => resetForm()}
                className="rounded-2xl bg-slate-100 px-5 py-4 text-lg font-black text-slate-700"
              >
                ล้างฟอร์ม
              </button>
            </div>
          </form>
        </section>

        <div className="mt-5">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="ค้นหา รหัส / ชื่อ / บ้านเลขที่ / หมู่"
            className="w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-lg shadow-sm outline-none focus:border-blue-500"
          />
        </div>

        <div className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
            <div>
              <label className="text-sm font-black text-slate-700">
                กรอง / เรียงตาม
              </label>

              <select
                value={filterMode}
                onChange={(event) => {
                  setFilterMode(event.target.value as UserTableFilterMode);
                  setKeyword("");
                }}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="sequence">ลำดับ</option>
                <option value="userCode">รหัส</option>
                <option value="fullName">ชื่อ - สกุล</option>
                <option value="type">ประเภท</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-black text-slate-700">
                ค้นหา
              </label>

              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder={getFilterPlaceholder(filterMode)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-bold outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={() => {
                setFilterMode("userCode");
                setKeyword("");
              }}
              className="rounded-2xl bg-slate-900 px-5 py-3 font-black text-white"
            >
              Default: รหัส
            </button>
          </div>

          <p className="mt-3 text-xs font-bold text-slate-500">
            ค่าเริ่มต้นเรียงตามรหัส / เลือกกรองได้เฉพาะ ลำดับ, รหัส, ชื่อ - สกุล, ประเภท
          </p>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">รายชื่อผู้ใช้น้ำ</h2>
          <p className="text-sm font-bold text-slate-500">
            {filteredUsers.length.toLocaleString("th-TH")} รายการ
          </p>
        </div>

        {isLoadingUsers ? (
          <div className="mt-3 rounded-3xl bg-white p-6 text-center font-black text-slate-500 shadow-sm ring-1 ring-slate-200">
            กำลังโหลดรายชื่อผู้ใช้น้ำ...
          </div>
        ) : null}

        <section className="mt-3 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-center">ลำดับ</th>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อ - สกุล</th>
                  <th className="px-4 py-3">บ้านเลขที่</th>
                  <th className="px-4 py-3">หมู่</th>
                  <th className="px-4 py-3">เบอร์โทร</th>
                  <th className="px-4 py-3 text-right">มิเตอร์ล่าสุด</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3 text-right">ค่าบริการ</th>
                  <th className="px-4 py-3 text-center">จัดการ</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center font-black text-slate-400"
                    >
                      ไม่พบรายชื่อผู้ใช้น้ำ
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, index) => {
                    const displayServiceFee = Number(
                      user.serviceFeeOverride || settings.serviceFee
                    );

                    return (
                      <tr
                        key={user.id}
                        className="border-t border-slate-100 align-top hover:bg-blue-50/40"
                      >
                        <td className="px-4 py-3 text-center font-bold text-slate-500">
                          {(index + 1).toLocaleString("th-TH")}
                        </td>

                        <td className="px-4 py-3 font-black text-blue-700">
                          {user.userCode || "-"}
                        </td>

                        <td className="px-4 py-3">
                          <p className="font-black text-slate-900">
                            {user.fullName || "-"}
                          </p>
                          {user.note ? (
                            <p className="mt-1 text-xs text-slate-500">
                              {user.note}
                            </p>
                          ) : null}
                        </td>

                        <td className="px-4 py-3 font-bold text-slate-700">
                          {user.address || "-"}
                        </td>

                        <td className="px-4 py-3 font-bold text-slate-700">
                          {user.villageNo || "-"}
                        </td>

                        <td className="px-4 py-3 font-bold text-slate-600">
                          {user.phone || "-"}
                        </td>

                        <td className="px-4 py-3 text-right font-black text-slate-900">
                          {Number(user.lastReading || 0).toLocaleString("th-TH")}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={
                              user.cutMeter || user.status === "cut"
                                ? "inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700"
                                : user.serviceOnly
                                  ? "inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700"
                                  : "inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"
                            }
                          >
                            {getUserTypeLabel(user)}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right font-black">
                          {user.serviceOnly
                            ? formatMoney(displayServiceFee)
                            : "-"}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEditUser(user)}
                              className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-black text-blue-700"
                            >
                              แก้ไข
                            </button>

                            <button
                              onClick={() => void handleDeleteUser(user)}
                              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white"
                            >
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
            เลื่อนซ้าย-ขวาได้บนมือถือ / แสดงแบบตารางเพื่อเช็กรายชื่อรวดเร็ว
          </div>
        </section>

        <button
          onClick={handleResetUsers}
          className="mt-6 w-full rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 font-black text-orange-700"
        >
          {dataSourceMode === "supabase" ? "โหลด Supabase ใหม่" : "คืนค่ารายชื่อเริ่มต้น"}
        </button>
      </section>

      <nav className="fixed bottom-3 left-3 right-3 z-20 rounded-3xl border border-slate-200 bg-white/95 px-2 py-2 shadow-xl backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-4 gap-1 text-center text-xs">
          <Link href="/" className="rounded-2xl px-2 py-2 font-bold text-slate-500">
            <div className="text-lg">🏠</div>
            หน้าหลัก
          </Link>

          <Link
            href="/meter-reading"
            className="rounded-2xl px-2 py-2 font-bold text-slate-500"
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
