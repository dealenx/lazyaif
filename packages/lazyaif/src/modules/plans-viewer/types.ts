/** Тип плана ai-factory. */
export type PlanKind = "fast" | "full";

/** Состояние выполнения плана. */
export type PlanState = "done" | "in-progress" | "not-started";

/** Настройки плана из секции `## Settings`. */
export interface PlanSettings {
  testing: boolean;
  logging: "verbose" | "standard" | "minimal";
  docs: boolean;
}

/** Задача из плана ai-factory. */
export interface Task {
  id: number;
  title: string;
  done: boolean;
  phase: string;
  description: string;
  dependsOn: number[];
}

/** Фаза плана. */
export interface Phase {
  name: string;
  tasks: Task[];
}

/** Распарсенный план ai-factory. */
export interface Plan {
  kind: PlanKind;
  path: string;
  fileName: string;
  title: string;
  branch: string;
  created: string;
  settings: PlanSettings;
  phases: Phase[];
  tasks: Task[];
}

/** Статус выполнения плана. */
export interface PlanStatus {
  done: number;
  total: number;
  pct: number;
  state: PlanState;
}