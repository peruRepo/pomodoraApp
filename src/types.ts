export type TaskStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "deferred"
  | "cancelled"
  | "missed";

export type TaskEvent = {
  at: string;
  type:
    | "completed"
    | "deferred"
    | "cancelled"
    | "auto_accepted"
    | "rescheduled"
    | "reopened";
  note?: string;
};

export type PomodoroTask = {
  id: string;
  title: string;
  startAt: string;
  durationMinutes: number;
  gapAfterMinutes?: number;
  notes?: string;
  project?: string;
  status: TaskStatus;
  originalStartAt?: string;
  history?: TaskEvent[];
};

export type PomodoroPlan = {
  schemaVersion: 1;
  timezone: string;
  generatedAt?: string;
  tasks: PomodoroTask[];
};
