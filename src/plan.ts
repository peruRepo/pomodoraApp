import { PomodoroPlan, PomodoroTask, TaskStatus } from "./types";

const STATUSES: TaskStatus[] = [
  "scheduled",
  "active",
  "completed",
  "deferred",
  "cancelled",
  "missed",
];

export const SAMPLE_PLAN: PomodoroPlan = {
  schemaVersion: 1,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  generatedAt: new Date().toISOString(),
  tasks: [
    {
      id: "sample-1",
      title: "Review today's priorities",
      startAt: nextRoundedTime(5).toISOString(),
      durationMinutes: 25,
      gapAfterMinutes: 5,
      project: "Planning",
      notes: "Choose the three outcomes that matter most.",
      status: "scheduled",
      history: [],
    },
    {
      id: "sample-2",
      title: "Deep work block",
      startAt: nextRoundedTime(35).toISOString(),
      durationMinutes: 50,
      gapAfterMinutes: 10,
      project: "Focus",
      status: "scheduled",
      history: [],
    },
  ],
};

function nextRoundedTime(minutesFromNow: number) {
  const date = new Date(Date.now() + minutesFromNow * 60_000);
  date.setSeconds(0, 0);
  return date;
}

export function parsePlan(input: string): PomodoroPlan {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new Error("This is not valid JSON. Check commas, quotes, and brackets.");
  }

  if (!value || typeof value !== "object") {
    throw new Error("The JSON must contain a plan object.");
  }

  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.tasks)) {
    throw new Error('The plan needs a "tasks" array.');
  }

  const seen = new Set<string>();
  const tasks = raw.tasks.map((item, index) => normalizeTask(item, index, seen));
  tasks.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  return {
    schemaVersion: 1,
    timezone:
      typeof raw.timezone === "string"
        ? raw.timezone
        : Intl.DateTimeFormat().resolvedOptions().timeZone,
    generatedAt:
      typeof raw.generatedAt === "string" ? raw.generatedAt : new Date().toISOString(),
    tasks,
  };
}

function normalizeTask(
  item: unknown,
  index: number,
  seen: Set<string>,
): PomodoroTask {
  if (!item || typeof item !== "object") {
    throw new Error(`Task ${index + 1} must be an object.`);
  }
  const task = item as Record<string, unknown>;
  const title = typeof task.title === "string" ? task.title.trim() : "";
  if (!title) throw new Error(`Task ${index + 1} needs a title.`);

  const date = new Date(String(task.startAt ?? ""));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`"${title}" needs a valid ISO-8601 startAt timestamp.`);
  }

  const duration = Number(task.durationMinutes);
  if (!Number.isFinite(duration) || duration < 1 || duration > 720) {
    throw new Error(`"${title}" durationMinutes must be between 1 and 720.`);
  }

  const gap = task.gapAfterMinutes === undefined ? 0 : Number(task.gapAfterMinutes);
  if (!Number.isFinite(gap) || gap < 0 || gap > 720) {
    throw new Error(`"${title}" gapAfterMinutes must be between 0 and 720.`);
  }

  const id =
    typeof task.id === "string" && task.id.trim()
      ? task.id.trim()
      : `${date.getTime()}-${index + 1}`;
  if (seen.has(id)) throw new Error(`Task id "${id}" is duplicated.`);
  seen.add(id);

  const status = STATUSES.includes(task.status as TaskStatus)
    ? (task.status as TaskStatus)
    : "scheduled";

  return {
    id,
    title,
    startAt: date.toISOString(),
    durationMinutes: Math.round(duration),
    gapAfterMinutes: Math.round(gap),
    notes: typeof task.notes === "string" ? task.notes : undefined,
    project: typeof task.project === "string" ? task.project : undefined,
    status,
    originalStartAt:
      typeof task.originalStartAt === "string" ? task.originalStartAt : undefined,
    history: Array.isArray(task.history) ? (task.history as PomodoroTask["history"]) : [],
  };
}

export function findScheduleConflicts(tasks: PomodoroTask[]): Set<string> {
  const conflicts = new Set<string>();
  const liveTasks = tasks
    .filter((task) => task.status !== "cancelled" && task.status !== "completed")
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  liveTasks.forEach((task, index) => {
    const next = liveTasks[index + 1];
    if (!next) return;
    const requiredEnd =
      Date.parse(task.startAt) +
      (task.durationMinutes + (task.gapAfterMinutes ?? 0)) * 60_000;
    if (Date.parse(next.startAt) < requiredEnd) {
      conflicts.add(task.id);
      conflicts.add(next.id);
    }
  });
  return conflicts;
}

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function isSameLocalDay(a: Date, b: Date) {
  return dayKey(a) === dayKey(b);
}

export function endAt(task: PomodoroTask) {
  return new Date(Date.parse(task.startAt) + task.durationMinutes * 60_000);
}

export function displayTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
