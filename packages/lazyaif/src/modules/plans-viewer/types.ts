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
  /** Исходный markdown файла плана (для рендера в TUI). */
  rawMarkdown: string;
  /** Время последней модификации файла на диске (ms epoch, из fs.stat().mtimeMs). */
  mtime: number;
}

/** Статус выполнения плана. */
export interface PlanStatus {
  done: number;
  total: number;
  pct: number;
  state: PlanState;
  /**
   * Tasks that are not done but have a non-empty description — i.e.
   * work has been started on them in the plan text. This is a
   * heuristic, not parser-derived state, because the plan schema
   * only has `done: boolean` per task. If a future parser change
   * adds a real `state` field, this heuristic can be replaced.
   */
  inProgress?: number;
  /** Tasks that are not done and have an empty description. */
  notStarted?: number;
}