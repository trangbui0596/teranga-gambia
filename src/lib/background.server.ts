// Lets a server route finish its HTTP reply quickly and keep heavy work running afterwards.
// src/server.ts stores the Worker execution context per request; we call ctx.waitUntil(promise).
import { AsyncLocalStorage } from "node:async_hooks";

type Ctx = { waitUntil?: (p: Promise<unknown>) => void } | undefined;
export const requestCtx = new AsyncLocalStorage<Ctx>();

export function runInBackground(label: string, work: () => Promise<unknown>) {
  const p = work().catch((e) => console.error(`[background:${label}]`, e));
  const ctx = requestCtx.getStore();
  if (ctx?.waitUntil) ctx.waitUntil(p);
  // In local dev (Node) there is no waitUntil; the promise simply keeps running.
}
