export type DataSourceMode = "localStorage" | "supabase";

export const DATA_SOURCE_STORAGE_KEY = "water-billing-data-source";

let memoryDataSourceMode: DataSourceMode = "localStorage";

export function normalizeDataSourceMode(value: unknown): DataSourceMode {
  return value === "supabase" ? "supabase" : "localStorage";
}

export function getDataSourceMode(): DataSourceMode {
  if (typeof window === "undefined") {
    return "localStorage";
  }

  try {
    return normalizeDataSourceMode(
      window.localStorage.getItem(DATA_SOURCE_STORAGE_KEY)
    );
  } catch {
    return memoryDataSourceMode;
  }
}

export function setDataSourceMode(mode: DataSourceMode) {
  if (typeof window === "undefined") {
    return;
  }

  memoryDataSourceMode = mode;

  try {
    window.localStorage.setItem(DATA_SOURCE_STORAGE_KEY, mode);
  } catch {}

  window.dispatchEvent(
    new CustomEvent("water-billing-data-source-change", {
      detail: { mode },
    })
  );
}

export function clearDataSourceMode() {
  if (typeof window === "undefined") {
    return;
  }

  memoryDataSourceMode = "localStorage";

  try {
    window.localStorage.removeItem(DATA_SOURCE_STORAGE_KEY);
  } catch {}

  window.dispatchEvent(
    new CustomEvent("water-billing-data-source-change", {
      detail: { mode: "localStorage" },
    })
  );
}

export function isSupabaseDataSource(mode = getDataSourceMode()) {
  return mode === "supabase";
}

export function getDataSourceModeLabel(mode: DataSourceMode) {
  return mode === "supabase" ? "Supabase" : "LocalStorage";
}

export function getDataSourceModeDescription(mode: DataSourceMode) {
  if (mode === "supabase") {
    return "อ่าน/เขียนผ่านฐานข้อมูล Supabase เมื่อหน้าระบบถูกย้ายแล้ว";
  }

  return "อ่าน/เขียนข้อมูลใน Browser เครื่องนี้ เหมือนระบบ V4 เดิม";
}
