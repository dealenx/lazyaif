import type { Plan, PlanStatus, PlanState } from "./types.js";

type PlanLike = Pick<Plan, "tasks">;

export function computeStatus(plan: PlanLike): PlanStatus {
  const total = plan.tasks.length;
  const done = plan.tasks.filter((t) => t.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  let state: PlanState;
  if (done === total && total > 0) state = "done";
  else if (done === 0) state = "not-started";
  else state = "in-progress";

  return { done, total, pct, state };
}