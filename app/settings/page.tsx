"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  buildBillingPeriod,
  getStoredAuthSettings,
  getStoredCurrentPeriod,
  getStoredSettings,
  saveStoredAuthSettings,
  saveStoredCurrentPeriod,
  saveStoredSettings,
} from "../../lib/local-store";
import { loadWaterAppData } from "../../lib/app-data-client";
import { getDataSourceMode, type DataSourceMode } from "../../lib/data-source";
import type {
  BillingPeriodStatus,
  WaterSettings,
} from "../../types/water-system";

const months = [
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

function safeNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function safeStatus(value: unknown): BillingPeriodStatus {
  if (value === "closed" || value === "locked") {
    return value;
  }

  return "open";
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<WaterSettings>({
    villageName: "ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน",
    serviceFee: 20,
    unitPrice: 8,
    meterMaxValue: 9999,
    receiptPrefix: "WR",
  });

  const [month, setMonth] = useState(6);
  const [year, setYear] = useState(2569);
  const [status, setStatus] = useState<BillingPeriodStatus>("open");

  const [username, setUsername] = useState("admin");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [message, setMessage] = useState("");
  const [dataSourceMode, setDataSourceMode] =
    useState<DataSourceMode>("localStorage");

  useEffect(() => {
    async function refreshData() {
      const mode = getDataSourceMode();
      const auth = getStoredAuthSettings();

      setDataSourceMode(mode);
      setUsername(auth.username || "admin");

      if (mode === "supabase") {
        try {
          const data = await loadWaterAppData();

          setSettings(data.settings);
          setMonth(safeNumber(data.currentPeriod.month, 6));
          setYear(safeNumber(data.currentPeriod.year, 2569));
          setStatus(safeStatus(data.currentPeriod.status));
          return;
        } catch (error) {
          show(error instanceof Error ? error.message : "โหลดตั้งค่าไม่สำเร็จ");
        }
      }

      const storedSettings = getStoredSettings();
      const period = getStoredCurrentPeriod();

      setSettings(storedSettings);
      setMonth(safeNumber(period.month, 6));
      setYear(safeNumber(period.year, 2569));
      setStatus(safeStatus(period.status));
    }

    void refreshData();
  }, []);

  function show(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

  async function handleSaveSettings() {
    const nextSettings: WaterSettings = {
      ...settings,
      unitPrice: safeNumber(settings.unitPrice, 8),
      serviceFee: safeNumber(settings.serviceFee, 20),
      meterMaxValue: safeNumber(settings.meterMaxValue, 9999),
      updatedAt: new Date().toISOString(),
    };

    const nextPeriod = buildBillingPeriod(month, year);

    nextPeriod.status = status;
    nextPeriod.closedAt = status === "open" ? null : new Date().toISOString();

    if (status === "locked") {
      nextPeriod.lockedAt = new Date().toISOString();
    }

    if (dataSourceMode === "supabase") {
      try {
        const response = await fetch("/api/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            settings: nextSettings,
            currentPeriod: nextPeriod,
          }),
        });

        const data = (await response.json()) as {
          ok: boolean;
          message?: string;
          error?: string;
          settings?: WaterSettings;
        };

        if (!response.ok || !data.ok) {
          show(data.error || data.message || "บันทึกตั้งค่าเข้า Supabase ไม่สำเร็จ");
          return;
        }

        setSettings(data.settings || nextSettings);
        show("บันทึกการตั้งค่าเข้า Supabase แล้ว");
        return;
      } catch (error) {
        show(
          error instanceof Error
            ? error.message
            : "บันทึกตั้งค่าเข้า Supabase ไม่สำเร็จ"
        );
        return;
      }
    }

    saveStoredSettings(nextSettings);
    saveStoredCurrentPeriod(nextPeriod);
    setSettings(nextSettings);

    show("บันทึกการตั้งค่าแล้ว");
  }

  function handleChangePassword() {
    const auth = getStoredAuthSettings();

    if (oldPassword !== auth.password) {
      show("รหัสเดิมไม่ถูกต้อง");
      return;
    }

    if (newPassword.trim().length < 4) {
      show("รหัสใหม่ต้องมีอย่างน้อย 4 ตัว");
      return;
    }

    saveStoredAuthSettings({
      username: username.trim() || "admin",
      password: newPassword,
      role: "admin",
      sessionHours: auth.sessionHours || 3,
      updatedAt: new Date().toISOString(),
    });

    document.cookie =
      "water-billing-session=; max-age=0; path=/; SameSite=Lax";

    try {
      localStorage.removeItem("water-billing-session-expires-at");
    } catch {}

    show("เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่");

    window.setTimeout(() => {
      window.location.replace("/login");
    }, 1000);
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-24">
      <section className="bg-gradient-to-br from-slate-950 via-blue-900 to-cyan-700 px-4 pb-20 pt-5 text-white">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="text-sm font-bold text-blue-100">
            ← กลับหน้าหลัก
          </Link>

          <h1 className="mt-5 text-3xl font-black">ตั้งค่าระบบ</h1>

          <p className="mt-1 text-sm text-blue-100">
            ค่าน้ำ · รอบบิล · รหัสผ่าน
          </p>
        </div>
      </section>

      <section className="mx-auto -mt-12 max-w-5xl px-4">
        {message ? (
          <div className="mb-4 rounded-3xl bg-emerald-50 p-4 text-center font-black text-emerald-700">
            {message}
          </div>
        ) : null}

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-black text-slate-900">รอบบิล</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-sm font-black text-slate-700">เดือน</label>
              <select
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 font-bold"
              >
                {months.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>
                    {monthName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-black text-slate-700">ปี พ.ศ.</label>
              <input
                type="number"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                className="mt-2 w-full rounded-2xl border border-slate-200 p-4 font-bold"
              />
            </div>

            <div>
              <label className="text-sm font-black text-slate-700">
                สถานะรอบบิล
              </label>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as BillingPeriodStatus)
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 font-bold"
              >
                <option value="open">เปิดใช้งาน</option>
                <option value="closed">ปิดรอบ</option>
                <option value="locked">ล็อก</option>
              </select>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-black text-slate-900">ข้อมูลระบบ</h2>

          <div className="mt-4 grid gap-3">
            <input
              value={settings.villageName}
              onChange={(event) =>
                setSettings({ ...settings, villageName: event.target.value })
              }
              placeholder="ชื่อระบบ / ชื่อหมู่บ้าน"
              className="w-full rounded-2xl border border-slate-200 p-4 font-bold"
            />

            <input
              value={settings.receiptVillageLine || ""}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  receiptVillageLine: event.target.value,
                })
              }
              placeholder="บรรทัดหัวใบเสร็จ"
              className="w-full rounded-2xl border border-slate-200 p-4 font-bold"
            />

            <div className="grid gap-3 md:grid-cols-3">
              <input
                type="number"
                value={settings.unitPrice}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    unitPrice: Number(event.target.value),
                  })
                }
                placeholder="หน่วยละ"
                className="rounded-2xl border border-slate-200 p-4 font-bold"
              />

              <input
                type="number"
                value={settings.serviceFee}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    serviceFee: Number(event.target.value),
                  })
                }
                placeholder="ค่าบริการ"
                className="rounded-2xl border border-slate-200 p-4 font-bold"
              />

              <input
                type="number"
                value={settings.meterMaxValue}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    meterMaxValue: Number(event.target.value),
                  })
                }
                placeholder="เลขมิเตอร์สูงสุด"
                className="rounded-2xl border border-slate-200 p-4 font-bold"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={settings.receiptBookNo || ""}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    receiptBookNo: event.target.value,
                  })
                }
                placeholder="เล่มที่ใบเสร็จ"
                className="rounded-2xl border border-slate-200 p-4 font-bold"
              />

              <input
                value={settings.receiptPrefix || "WR"}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    receiptPrefix: event.target.value,
                  })
                }
                placeholder="Prefix ใบเสร็จ"
                className="rounded-2xl border border-slate-200 p-4 font-bold"
              />

              <input
                type="number"
                value={settings.defaultReceiptDay || ""}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    defaultReceiptDay: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                placeholder="วันที่ใบเสร็จ เช่น 30"
                className="rounded-2xl border border-slate-200 p-4 font-bold"
              />
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            className="mt-5 w-full rounded-2xl bg-blue-600 p-4 font-black text-white"
          >
            บันทึกการตั้งค่า
          </button>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-black text-slate-900">เปลี่ยน Login</h2>

          <div className="mt-4 grid gap-3">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              className="w-full rounded-2xl border border-slate-200 p-4 font-bold"
            />

            <input
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              placeholder="รหัสเดิม"
              className="w-full rounded-2xl border border-slate-200 p-4 font-bold"
            />

            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="รหัสใหม่"
              className="w-full rounded-2xl border border-slate-200 p-4 font-bold"
            />

            <button
              onClick={handleChangePassword}
              className="w-full rounded-2xl bg-slate-900 p-4 font-black text-white"
            >
              เปลี่ยนรหัสผ่าน
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
