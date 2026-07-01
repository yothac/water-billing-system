import type { WaterSettings, WaterUser } from "../types/water-system";

export function getUserServiceFee(
  user: WaterUser | undefined | null,
  settings: WaterSettings
): number {
  const customFee = Number(user?.serviceFeeOverride ?? 0);

  if (customFee > 0) {
    return customFee;
  }

  return Number(settings.serviceFee) || 0;
}