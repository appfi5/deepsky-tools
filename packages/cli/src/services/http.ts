import { toErrorMessage } from "../utils/errors";

export async function requestJson<T>(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const response = await fetchImpl(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();

  if (!response.ok) {
    const message = text.trim()
      ? `${response.status} ${response.statusText}: ${text}`
      : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  if (!text.trim()) {
    throw new Error(`Expected JSON response from ${input}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Invalid JSON response from ${input}: ${toErrorMessage(error)}`);
  }
}
