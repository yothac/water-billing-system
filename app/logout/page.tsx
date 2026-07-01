"use client";

import { useEffect } from "react";

function clearSession() {
  document.cookie = "water-billing-session=; max-age=0; path=/; SameSite=Lax";

  try {
    localStorage.removeItem("water-billing-session-expires-at");
  } catch {}
}

export default function LogoutPage() {
  useEffect(() => {
    clearSession();

    window.setTimeout(() => {
      window.location.replace("/login");
    }, 300);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow">
        <div className="text-4xl">🔒</div>
        <h1 className="mt-3 text-2xl font-black">ออกจากระบบแล้ว</h1>
        <p className="mt-2 text-slate-500">กำลังกลับไปหน้า Login</p>
      </section>
    </main>
  );
}
