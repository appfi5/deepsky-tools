import { randomUUID } from "node:crypto";
import { CKB_DECIMALS } from "./constants";
import type { BalanceObservation, TopUpAmount } from "../types";

const POSITIVE_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export function normalizeAuthorizationToken(token: string): string {
  return token.trim().toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function parsePositiveInteger(value: unknown, key: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}

export function parseNonNegativeNumber(value: unknown, key: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative number`);
  }
  return parsed;
}

export function parseTopUpAmount(input: string): TopUpAmount {
  const trimmed = input.trim();
  if (!POSITIVE_DECIMAL_PATTERN.test(trimmed)) {
    throw new Error("amount must be a positive CKB decimal string");
  }

  const [rawIntegerPart = "0", rawFractionPart = ""] = trimmed.split(".");
  if (rawFractionPart.length > CKB_DECIMALS) {
    throw new Error(`amount supports at most ${CKB_DECIMALS} decimal places`);
  }

  const integerPart = rawIntegerPart.replace(/^0+(?=\d)/, "") || "0";
  const fractionPadded = rawFractionPart.padEnd(CKB_DECIMALS, "0");
  const fractionTrimmed = rawFractionPart.replace(/0+$/, "");
  const normalized = fractionTrimmed ? `${integerPart}.${fractionTrimmed}` : integerPart;
  const shannon =
    BigInt(integerPart) * 10n ** BigInt(CKB_DECIMALS) + BigInt(fractionPadded || "0");
  const numeric = Number(normalized);

  if (!Number.isFinite(numeric) || shannon <= 0n) {
    throw new Error("amount must be greater than 0");
  }

  return {
    input: trimmed,
    normalized,
    numeric,
    shannon: shannon.toString(),
  };
}

export function calculateBurnRate(observations: BalanceObservation[]): number {
  if (observations.length < 2) {
    return 0;
  }

  const sorted = [...observations].sort(
    (left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime(),
  );

  let totalRate = 0;
  let count = 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current) {
      continue;
    }

    const minutes =
      (new Date(current.ts).getTime() - new Date(previous.ts).getTime()) / 60_000;
    if (minutes <= 0) {
      continue;
    }

    const diff = previous.remaining - current.remaining;
    if (diff < 0) {
      continue;
    }

    totalRate += diff / minutes;
    count += 1;
  }

  return count > 0 ? totalRate / count : 0;
}
