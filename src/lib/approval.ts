// Pure approval gate: an answer may be approved only when fully processed (translated EN/DE/NL).
export type ApprovalRow = { stage: string | null; english: string | null; german: string | null; dutch: string | null };
export const STILL_PROCESSING = "Still processing, try again in a minute.";
export function isReadyToApprove(r: ApprovalRow | null): boolean {
  return !!r && (r.stage === "translated" || r.stage === "checked") && !!r.english && !!r.german && !!r.dutch;
}
/** Loads the row; if not ready, runs the remaining pipeline once within the budget, then re-checks. */
export async function gateApproval(
  id: string,
  deps: { load: (id: string) => Promise<ApprovalRow | null>; finish: (id: string, budgetMs: number) => Promise<unknown> },
  budgetMs = 10000,
): Promise<boolean> {
  if (isReadyToApprove(await deps.load(id))) return true;
  try { await deps.finish(id, budgetMs); } catch (e) { console.error(`[approve ${id}] error step=finish`, e); }
  return isReadyToApprove(await deps.load(id));
}
