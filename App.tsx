import DateTimePicker from "@react-native-community/datetimepicker";
import * as Clipboard from "expo-clipboard";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { syncNotifications } from "./src/notifications";
import {
  SAMPLE_PLAN,
  dayKey,
  displayTime,
  endAt,
  findScheduleConflicts,
  isSameLocalDay,
  parsePlan,
} from "./src/plan";
import { loadPlan, savePlan } from "./src/storage";
import { PomodoroPlan, PomodoroTask, TaskEvent, TaskStatus } from "./src/types";

type ViewMode = "today" | "schedule";
type JsonMode = "import" | "export";

const COLORS = {
  ink: "#17211B",
  muted: "#66736B",
  paper: "#F4F3EC",
  white: "#FFFEF9",
  green: "#1F6B4F",
  lime: "#DCE95A",
  coral: "#E87D5F",
  blue: "#4D74B8",
  line: "#DDE0D8",
  paleGreen: "#E5EFE8",
  paleCoral: "#F8E6DF",
};

export default function App() {
  return (
    <SafeAreaProvider>
      <FlowApp />
    </SafeAreaProvider>
  );
}

function FlowApp() {
  const [plan, setPlan] = useState<PomodoroPlan | null>(null);
  const [now, setNow] = useState(new Date());
  const [view, setView] = useState<ViewMode>("today");
  const [jsonMode, setJsonMode] = useState<JsonMode | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importSource, setImportSource] = useState<"paste" | "url">("paste");
  const [busy, setBusy] = useState(false);
  const [deferTask, setDeferTask] = useState<PomodoroTask | null>(null);
  const [deferDate, setDeferDate] = useState(new Date(Date.now() + 24 * 60 * 60_000));
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    loadPlan()
      .then((stored) => setPlan(stored ?? SAMPLE_PLAN))
      .catch(() => setPlan(SAMPLE_PLAN));
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!plan) return;
    savePlan(plan).catch(() => undefined);
  }, [plan]);

  useEffect(() => {
    setPlan((current) => {
      if (!current) return current;
      let changed = false;
      const timestamp = now.getTime();
      const tasks = current.tasks.map((task) => {
        const start = Date.parse(task.startAt);
        const end = start + task.durationMinutes * 60_000;
        if (task.status === "scheduled" && timestamp >= start && timestamp < end) {
          changed = true;
          return {
            ...task,
            status: "active" as const,
            history: [
              ...(task.history ?? []),
              {
                at: new Date().toISOString(),
                type: "auto_accepted" as const,
                note: "Started automatically because no response was recorded.",
              },
            ],
          };
        }
        if (
          (task.status === "scheduled" || task.status === "active") &&
          timestamp >= end
        ) {
          changed = true;
          return { ...task, status: "missed" as const };
        }
        return task;
      });
      return changed ? { ...current, tasks } : current;
    });
  }, [now]);

  const updateTask = useCallback(
    (id: string, status: TaskStatus, event: TaskEvent["type"]) => {
      setPlan((current) => {
        if (!current) return current;
        const tasks = current.tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                status,
                history: [...(task.history ?? []), { at: new Date().toISOString(), type: event }],
              }
            : task,
        );
        syncNotifications(tasks).catch(() => undefined);
        return { ...current, tasks };
      });
    },
    [],
  );

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const taskId = response.notification.request.content.data?.taskId;
      const action = response.actionIdentifier;
      if (typeof taskId !== "string") return;
      const task = plan?.tasks.find((item) => item.id === taskId);
      if (action === "COMPLETE" && task) confirmComplete(task);
      if (action === "CANCEL" && task) confirmCancel(task);
      if (action === "ACCEPT") updateTask(taskId, "active", "auto_accepted");
      if (action === "DEFER") {
        if (task) openDefer(task);
      }
    });
    return () => sub.remove();
  }, [plan, updateTask]);

  const derivedTasks = useMemo(() => {
    if (!plan) return [];
    return plan.tasks.map((task) => {
      if (task.status !== "scheduled" && task.status !== "active") return task;
      const start = Date.parse(task.startAt);
      const end = start + task.durationMinutes * 60_000;
      if (now.getTime() >= start && now.getTime() < end) return { ...task, status: "active" as const };
      if (now.getTime() >= end) return { ...task, status: "missed" as const };
      return task;
    });
  }, [plan, now]);

  const activeTask = derivedTasks.find((task) => task.status === "active");
  const todayTasks = derivedTasks.filter((task) => isSameLocalDay(new Date(task.startAt), now));
  const visibleTasks = view === "today" ? todayTasks : derivedTasks;
  const conflicts = useMemo(() => findScheduleConflicts(derivedTasks), [derivedTasks]);
  const upcomingCount = derivedTasks.filter(
    (task) => Date.parse(task.startAt) > now.getTime() && task.status === "scheduled",
  ).length;

  function showBanner(message: string) {
    setBanner(message);
    setTimeout(() => setBanner(null), 2600);
  }

  function confirmComplete(task: PomodoroTask) {
    Alert.alert(
      "Complete this task?",
      `Mark “${task.title}” as completed?`,
      [
        { text: "Keep working", style: "cancel" },
        {
          text: "Complete",
          onPress: () => {
            updateTask(task.id, "completed", "completed");
            showBanner("Task completed");
          },
        },
      ],
    );
  }

  function confirmCancel(task: PomodoroTask) {
    Alert.alert(
      "Cancel this task?",
      `Remove “${task.title}” from the active schedule?`,
      [
        { text: "Keep task", style: "cancel" },
        {
          text: "Cancel task",
          style: "destructive",
          onPress: () => {
            updateTask(task.id, "cancelled", "cancelled");
            showBanner("Task cancelled");
          },
        },
      ],
    );
  }

  function confirmUndo(task: PomodoroTask) {
    const wasCompleted = task.status === "completed";
    const actionName = wasCompleted ? "completion" : "cancellation";
    Alert.alert(
      `Undo ${actionName}?`,
      `Reopen “${task.title}” and return it to your schedule?`,
      [
        {
          text: wasCompleted ? "Keep completed" : "Keep cancelled",
          style: "cancel",
        },
        {
          text: "Undo",
          onPress: () => {
            const start = Date.parse(task.startAt);
            const end = start + task.durationMinutes * 60_000;
            const timestamp = Date.now();
            const restoredStatus: TaskStatus =
              timestamp < start ? "scheduled" : timestamp < end ? "active" : "missed";
            updateTask(task.id, restoredStatus, "reopened");
            showBanner(wasCompleted ? "Completion undone" : "Cancellation undone");
          },
        },
      ],
    );
  }

  function openJson(mode: JsonMode) {
    setJsonMode(mode);
    if (mode === "export" && plan) setJsonText(JSON.stringify(plan, null, 2));
    if (mode === "import") setJsonText("");
  }

  async function importPlan(raw?: string) {
    setBusy(true);
    try {
      let source = raw ?? jsonText;
      if (importSource === "url" && raw === undefined) {
        const response = await fetch(importUrl.trim(), { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`The server returned ${response.status}.`);
        source = await response.text();
      }
      const parsed = parsePlan(source);
      setPlan(parsed);
      const notified = await syncNotifications(parsed.tasks);
      setJsonMode(null);
      showBanner(
        `Imported ${parsed.tasks.length} task${parsed.tasks.length === 1 ? "" : "s"}${
          notified ? " · reminders scheduled" : ""
        }`,
      );
    } catch (error) {
      Alert.alert("Could not import plan", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function copyExport() {
    if (!plan) return;
    await Clipboard.setStringAsync(JSON.stringify(plan, null, 2));
    showBanner("Full plan JSON copied");
    setJsonMode(null);
  }

  function openDefer(task: PomodoroTask) {
    const current = new Date(task.startAt);
    const nextDay = new Date(Math.max(current.getTime() + 24 * 60 * 60_000, Date.now() + 60_000));
    setDeferDate(nextDay);
    setDeferTask(task);
  }

  function confirmDefer() {
    if (!deferTask || !plan) return;
    const tasks = plan.tasks.map((task) =>
      task.id === deferTask.id
        ? {
            ...task,
            originalStartAt: task.originalStartAt ?? task.startAt,
            startAt: deferDate.toISOString(),
            status: "scheduled" as const,
            history: [
              ...(task.history ?? []),
              {
                at: new Date().toISOString(),
                type: "deferred" as const,
                note: `Moved to ${deferDate.toISOString()}`,
              },
            ],
          }
        : task,
    );
    tasks.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
    const nextPlan = { ...plan, tasks };
    setPlan(nextPlan);
    syncNotifications(tasks).catch(() => undefined);
    setDeferTask(null);
    showBanner("Task deferred");
  }

  if (!plan) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.green} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>FLOW</Text>
          <Text style={styles.heading}>
            {view === "today" ? "Today" : "Your plan"}
          </Text>
        </View>
        <Pressable style={styles.jsonButton} onPress={() => openJson("import")}>
          <Text style={styles.jsonButtonIcon}>{"{ }"}</Text>
          <Text style={styles.jsonButtonText}>JSON</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTask ? (
          <ActiveCard
            task={activeTask}
            now={now}
            onComplete={() => confirmComplete(activeTask)}
            onDefer={() => openDefer(activeTask)}
            onCancel={() => confirmCancel(activeTask)}
          />
        ) : (
          <NextCard tasks={derivedTasks} now={now} />
        )}

        <View style={styles.summaryRow}>
          <SummaryStat value={String(todayTasks.length)} label="today" />
          <View style={styles.summaryDivider} />
          <SummaryStat value={String(upcomingCount)} label="upcoming" />
          <View style={styles.summaryDivider} />
          <SummaryStat value={String(conflicts.size)} label="need spacing" alert={conflicts.size > 0} />
        </View>

        <View style={styles.segment}>
          <Pressable
            style={[styles.segmentButton, view === "today" && styles.segmentButtonActive]}
            onPress={() => setView("today")}
          >
            <Text style={[styles.segmentText, view === "today" && styles.segmentTextActive]}>
              Today
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentButton, view === "schedule" && styles.segmentButtonActive]}
            onPress={() => setView("schedule")}
          >
            <Text style={[styles.segmentText, view === "schedule" && styles.segmentTextActive]}>
              All days
            </Text>
          </Pressable>
        </View>

        <TaskList
          tasks={visibleTasks}
          conflicts={conflicts}
          now={now}
          onComplete={confirmComplete}
          onDefer={openDefer}
          onCancel={confirmCancel}
          onUndo={confirmUndo}
        />

        <Pressable style={styles.exportButton} onPress={() => openJson("export")}>
          <Text style={styles.exportIcon}>↗</Text>
          <View style={styles.exportCopy}>
            <Text style={styles.exportTitle}>Export the full plan</Text>
            <Text style={styles.exportSubtitle}>Copy JSON, edit it with AI, then import again</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Text style={styles.footerNote}>
          Timers use real clock time, so Flow does not need to stay awake in the background.
        </Text>
      </ScrollView>

      {banner ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>✓ {banner}</Text>
        </View>
      ) : null}

      <JsonModal
        mode={jsonMode}
        value={jsonText}
        setValue={setJsonText}
        source={importSource}
        setSource={setImportSource}
        url={importUrl}
        setUrl={setImportUrl}
        busy={busy}
        onClose={() => setJsonMode(null)}
        onImport={() => importPlan()}
        onSample={() => {
          setImportSource("paste");
          setJsonText(JSON.stringify(SAMPLE_PLAN, null, 2));
        }}
        onCopy={copyExport}
      />

      <DeferModal
        task={deferTask}
        date={deferDate}
        setDate={setDeferDate}
        onClose={() => setDeferTask(null)}
        onConfirm={confirmDefer}
      />
    </SafeAreaView>
  );
}

function ActiveCard({
  task,
  now,
  onComplete,
  onDefer,
  onCancel,
}: {
  task: PomodoroTask;
  now: Date;
  onComplete: () => void;
  onDefer: () => void;
  onCancel: () => void;
}) {
  const remaining = Math.max(0, endAt(task).getTime() - now.getTime());
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const progress = Math.max(
    0,
    Math.min(1, 1 - remaining / (task.durationMinutes * 60_000)),
  );

  return (
    <View style={styles.activeCard}>
      <View style={styles.activeTop}>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>IN FOCUS</Text>
        </View>
        <Text style={styles.endTime}>until {displayTime(endAt(task))}</Text>
      </View>
      <Text style={styles.activeTitle}>{task.title}</Text>
      {task.project ? <Text style={styles.activeProject}>{task.project}</Text> : null}
      <Text style={styles.timer}>
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.activeActions}>
        <ActionButton label="Complete" symbol="✓" onPress={onComplete} primary />
        <ActionButton label="Defer" symbol="↷" onPress={onDefer} />
        <ActionButton label="Cancel" symbol="×" onPress={onCancel} danger />
      </View>
    </View>
  );
}

function NextCard({ tasks, now }: { tasks: PomodoroTask[]; now: Date }) {
  const next = tasks.find(
    (task) => task.status === "scheduled" && Date.parse(task.startAt) > now.getTime(),
  );
  if (!next) {
    return (
      <View style={styles.clearCard}>
        <Text style={styles.clearMark}>✓</Text>
        <View>
          <Text style={styles.clearTitle}>Your runway is clear</Text>
          <Text style={styles.clearSubtitle}>Import a plan when you’re ready.</Text>
        </View>
      </View>
    );
  }
  const start = new Date(next.startAt);
  const today = isSameLocalDay(start, now);
  return (
    <View style={styles.nextCard}>
      <Text style={styles.nextLabel}>NEXT UP</Text>
      <Text style={styles.nextTitle}>{next.title}</Text>
      <Text style={styles.nextMeta}>
        {today ? "Today" : start.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
        {" · "}
        {displayTime(start)} · {next.durationMinutes} min
      </Text>
    </View>
  );
}

function SummaryStat({
  value,
  label,
  alert,
}: {
  value: string;
  label: string;
  alert?: boolean;
}) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryValue, alert && styles.summaryValueAlert]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function TaskList({
  tasks,
  conflicts,
  now,
  onComplete,
  onDefer,
  onCancel,
  onUndo,
}: {
  tasks: PomodoroTask[];
  conflicts: Set<string>;
  now: Date;
  onComplete: (task: PomodoroTask) => void;
  onDefer: (task: PomodoroTask) => void;
  onCancel: (task: PomodoroTask) => void;
  onUndo: (task: PomodoroTask) => void;
}) {
  if (!tasks.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Nothing scheduled here</Text>
        <Text style={styles.emptyText}>Import JSON or switch to All days to see your plan.</Text>
      </View>
    );
  }

  let lastDay = "";
  return (
    <View>
      {tasks.map((task) => {
        const date = new Date(task.startAt);
        const key = dayKey(date);
        const showDay = key !== lastDay;
        lastDay = key;
        const isToday = isSameLocalDay(date, now);
        return (
          <View key={task.id}>
            {showDay ? (
              <View style={styles.dayHeader}>
                <Text style={styles.dayTitle}>
                  {isToday
                    ? "TODAY"
                    : date.toLocaleDateString([], {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      }).toUpperCase()}
                </Text>
                <Text style={styles.dayDate}>
                  {date.toLocaleDateString([], { month: "2-digit", day: "2-digit" })}
                </Text>
              </View>
            ) : null}
            <TaskCard
              task={task}
              conflict={conflicts.has(task.id)}
              onComplete={() => onComplete(task)}
              onDefer={() => onDefer(task)}
              onCancel={() => onCancel(task)}
              onUndo={() => onUndo(task)}
            />
          </View>
        );
      })}
    </View>
  );
}

function TaskCard({
  task,
  conflict,
  onComplete,
  onDefer,
  onCancel,
  onUndo,
}: {
  task: PomodoroTask;
  conflict: boolean;
  onComplete: () => void;
  onDefer: () => void;
  onCancel: () => void;
  onUndo: () => void;
}) {
  const done = task.status === "completed";
  const cancelled = task.status === "cancelled";
  const inactive = done || cancelled;
  return (
    <View style={[styles.taskCard, task.status === "active" && styles.taskCardActive]}>
      <View style={styles.timeRail}>
        <Text style={styles.taskTime}>{displayTime(new Date(task.startAt))}</Text>
        <View
          style={[
            styles.statusNode,
            done && styles.statusNodeDone,
            task.status === "active" && styles.statusNodeActive,
            task.status === "missed" && styles.statusNodeMissed,
          ]}
        >
          {done ? <Text style={styles.statusCheck}>✓</Text> : null}
        </View>
        <View style={styles.railLine} />
      </View>
      <View style={styles.taskBody}>
        <View style={styles.taskTitleRow}>
          <Text style={[styles.taskTitle, inactive && styles.taskTitleInactive]}>{task.title}</Text>
          <StatusPill status={task.status} />
        </View>
        <Text style={styles.taskMeta}>
          {task.durationMinutes} min
          {task.gapAfterMinutes ? ` · ${task.gapAfterMinutes} min gap` : ""}
          {task.project ? ` · ${task.project}` : ""}
        </Text>
        {task.notes ? <Text style={styles.taskNotes}>{task.notes}</Text> : null}
        {conflict ? (
          <View style={styles.conflict}>
            <Text style={styles.conflictText}>⚠ This block overlaps required spacing</Text>
          </View>
        ) : null}
        {inactive ? (
          <View style={styles.taskActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={done ? "Undo task completion" : "Undo task cancellation"}
              style={[styles.miniAction, styles.undoAction]}
              onPress={onUndo}
            >
              <Text style={styles.undoActionText}>
                {done ? "↶ Undo complete" : "↶ Undo cancel"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.taskActions}>
            <Pressable style={styles.miniAction} onPress={onComplete}>
              <Text style={styles.miniActionText}>✓ Complete</Text>
            </Pressable>
            <Pressable style={styles.miniAction} onPress={onDefer}>
              <Text style={styles.miniActionText}>↷ Defer</Text>
            </Pressable>
            <Pressable style={styles.miniAction} onPress={onCancel}>
              <Text style={[styles.miniActionText, styles.cancelText]}>×</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  if (status === "scheduled") return null;
  const label =
    status === "missed" ? "REVIEW" : status === "active" ? "LIVE" : status.toUpperCase();
  return (
    <View
      style={[
        styles.statusPill,
        status === "completed" && styles.statusPillDone,
        status === "missed" && styles.statusPillMissed,
        status === "cancelled" && styles.statusPillCancelled,
      ]}
    >
      <Text style={styles.statusPillText}>{label}</Text>
    </View>
  );
}

function ActionButton({
  label,
  symbol,
  onPress,
  primary,
  danger,
}: {
  label: string;
  symbol: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={[styles.actionButton, primary && styles.actionButtonPrimary]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.actionSymbol,
          primary && styles.actionTextPrimary,
          danger && styles.actionTextDanger,
        ]}
      >
        {symbol}
      </Text>
      <Text
        style={[
          styles.actionLabel,
          primary && styles.actionTextPrimary,
          danger && styles.actionTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function JsonModal({
  mode,
  value,
  setValue,
  source,
  setSource,
  url,
  setUrl,
  busy,
  onClose,
  onImport,
  onSample,
  onCopy,
}: {
  mode: JsonMode | null;
  value: string;
  setValue: (value: string) => void;
  source: "paste" | "url";
  setSource: (value: "paste" | "url") => void;
  url: string;
  setUrl: (value: string) => void;
  busy: boolean;
  onClose: () => void;
  onImport: () => void;
  onSample: () => void;
  onCopy: () => void;
}) {
  return (
    <Modal visible={mode !== null} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={styles.modalPage}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Text style={styles.modalCancel}>Close</Text>
          </Pressable>
          <Text style={styles.modalTitle}>{mode === "import" ? "Import plan" : "Export plan"}</Text>
          <View style={styles.modalHeaderSpacer} />
        </View>
        {mode === "import" ? (
          <>
            <View style={styles.sourceTabs}>
              <Pressable
                style={[styles.sourceTab, source === "paste" && styles.sourceTabActive]}
                onPress={() => setSource("paste")}
              >
                <Text style={styles.sourceTabText}>Paste JSON</Text>
              </Pressable>
              <Pressable
                style={[styles.sourceTab, source === "url" && styles.sourceTabActive]}
                onPress={() => setSource("url")}
              >
                <Text style={styles.sourceTabText}>Fetch URL</Text>
              </Pressable>
              <Pressable
                style={[styles.sourceTab, styles.importTab, busy && styles.disabled]}
                onPress={onImport}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={styles.importTabText}>Import</Text>
                )}
              </Pressable>
            </View>
            {source === "paste" ? (
              <>
                <TextInput
                  style={styles.jsonInput}
                  value={value}
                  onChangeText={setValue}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder='Paste {"schemaVersion": 1, "tasks": [...]}'
                  placeholderTextColor="#909A93"
                  textAlignVertical="top"
                />
                <Pressable onPress={onSample}>
                  <Text style={styles.sampleLink}>Use example JSON</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.urlPanel}>
                <Text style={styles.fieldLabel}>JSON ENDPOINT</Text>
                <TextInput
                  style={styles.urlInput}
                  value={url}
                  onChangeText={setUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="https://example.com/my-plan.json"
                  placeholderTextColor="#909A93"
                />
                <Text style={styles.urlHint}>
                  The URL must return the same plan JSON format. Authentication can be added later.
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={styles.exportHelp}>
              This includes every task, status change, deferral, and original time.
            </Text>
            <TextInput
              style={styles.jsonInput}
              value={value}
              onChangeText={setValue}
              multiline
              editable={false}
              textAlignVertical="top"
            />
            <Pressable style={styles.modalPrimary} onPress={onCopy}>
              <Text style={styles.modalPrimaryText}>Copy full JSON</Text>
            </Pressable>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DeferModal({
  task,
  date,
  setDate,
  onClose,
  onConfirm,
}: {
  task: PomodoroTask | null;
  date: Date;
  setDate: (date: Date) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={task !== null} transparent animationType="fade">
      <View style={styles.sheetBackdrop}>
        <View style={styles.deferSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.deferEyebrow}>RESCHEDULE</Text>
          <Text style={styles.deferTitle}>{task?.title}</Text>
          <DateTimePicker
            value={date}
            mode="datetime"
            display={Platform.OS === "ios" ? "inline" : "default"}
            minimumDate={new Date()}
            onChange={(_, selected) => selected && setDate(selected)}
            accentColor={COLORS.green}
          />
          <View style={styles.deferActions}>
            <Pressable style={styles.deferCancel} onPress={onClose}>
              <Text style={styles.deferCancelText}>Keep original</Text>
            </Pressable>
            <Pressable style={styles.deferConfirm} onPress={onConfirm}>
              <Text style={styles.deferConfirmText}>Move task</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.paper },
  header: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: { color: COLORS.green, fontSize: 11, fontWeight: "800", letterSpacing: 2.4 },
  heading: { color: COLORS.ink, fontSize: 31, fontWeight: "800", letterSpacing: -1.2, marginTop: 1 },
  jsonButton: {
    backgroundColor: COLORS.ink,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 13,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  jsonButtonIcon: { color: COLORS.lime, fontWeight: "800", fontSize: 12 },
  jsonButtonText: { color: COLORS.white, fontWeight: "700", fontSize: 13 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 44 },
  activeCard: { backgroundColor: COLORS.ink, borderRadius: 28, padding: 20, marginTop: 4 },
  activeTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#2B3B32",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  liveDot: { width: 7, height: 7, backgroundColor: COLORS.lime, borderRadius: 4 },
  liveText: { color: COLORS.lime, fontWeight: "800", fontSize: 10, letterSpacing: 1.4 },
  endTime: { color: "#AEB9B2", fontSize: 12 },
  activeTitle: { color: COLORS.white, fontWeight: "700", fontSize: 22, marginTop: 20 },
  activeProject: { color: "#9DAAA2", fontSize: 13, marginTop: 4 },
  timer: { color: COLORS.white, fontSize: 64, fontWeight: "300", letterSpacing: -3, marginTop: 12 },
  progressTrack: { backgroundColor: "#35443C", height: 5, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: COLORS.lime, borderRadius: 4 },
  activeActions: { flexDirection: "row", gap: 8, marginTop: 18 },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#45534B",
    paddingVertical: 11,
    borderRadius: 13,
    alignItems: "center",
  },
  actionButtonPrimary: { backgroundColor: COLORS.lime, borderColor: COLORS.lime },
  actionSymbol: { color: COLORS.white, fontSize: 17, lineHeight: 18 },
  actionLabel: { color: COLORS.white, fontSize: 10, fontWeight: "700", marginTop: 3 },
  actionTextPrimary: { color: COLORS.ink },
  actionTextDanger: { color: "#F0A18D" },
  nextCard: { backgroundColor: COLORS.green, borderRadius: 24, padding: 20, marginTop: 4 },
  nextLabel: { color: COLORS.lime, fontSize: 10, fontWeight: "800", letterSpacing: 1.7 },
  nextTitle: { color: COLORS.white, fontSize: 22, fontWeight: "700", marginTop: 10 },
  nextMeta: { color: "#C3D7CC", fontSize: 13, marginTop: 7 },
  clearCard: {
    backgroundColor: COLORS.paleGreen,
    borderRadius: 24,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  clearMark: {
    width: 38,
    height: 38,
    borderRadius: 19,
    textAlign: "center",
    lineHeight: 38,
    color: COLORS.white,
    backgroundColor: COLORS.green,
    fontWeight: "800",
  },
  clearTitle: { color: COLORS.ink, fontWeight: "700", fontSize: 17 },
  clearSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  summaryRow: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    flexDirection: "row",
    marginTop: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  summaryStat: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: 20, fontWeight: "800", color: COLORS.ink },
  summaryValueAlert: { color: COLORS.coral },
  summaryLabel: { fontSize: 10, color: COLORS.muted, marginTop: 1 },
  summaryDivider: { width: 1, backgroundColor: COLORS.line },
  segment: {
    flexDirection: "row",
    backgroundColor: "#E8E8E1",
    borderRadius: 15,
    padding: 4,
    marginTop: 20,
    marginBottom: 18,
  },
  segmentButton: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: "center" },
  segmentButtonActive: { backgroundColor: COLORS.white },
  segmentText: { color: COLORS.muted, fontWeight: "700", fontSize: 13 },
  segmentTextActive: { color: COLORS.ink },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
    marginTop: 7,
  },
  dayTitle: { color: COLORS.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  dayDate: { color: "#9AA39D", fontSize: 11, fontVariant: ["tabular-nums"] },
  taskCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
  },
  taskCardActive: { borderColor: COLORS.green, borderWidth: 1.5 },
  timeRail: { width: 68, alignItems: "flex-start" },
  taskTime: { color: COLORS.ink, fontWeight: "700", fontSize: 12, fontVariant: ["tabular-nums"] },
  statusNode: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#B8C0BA",
    marginTop: 12,
    marginLeft: 4,
    backgroundColor: COLORS.white,
    zIndex: 2,
  },
  statusNodeDone: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  statusNodeActive: { backgroundColor: COLORS.lime, borderColor: COLORS.green },
  statusNodeMissed: { backgroundColor: COLORS.paleCoral, borderColor: COLORS.coral },
  statusCheck: { color: COLORS.white, fontSize: 8, lineHeight: 9, fontWeight: "900", marginLeft: 1 },
  railLine: { width: 1, flex: 1, minHeight: 44, backgroundColor: COLORS.line, marginLeft: 10, marginTop: -1 },
  taskBody: { flex: 1 },
  taskTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  taskTitle: { flex: 1, color: COLORS.ink, fontSize: 16, fontWeight: "700", lineHeight: 21 },
  taskTitleInactive: { color: "#88918B", textDecorationLine: "line-through" },
  taskMeta: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  taskNotes: { color: "#48544C", fontSize: 12, lineHeight: 17, marginTop: 7 },
  statusPill: { backgroundColor: COLORS.paleGreen, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 },
  statusPillDone: { backgroundColor: COLORS.paleGreen },
  statusPillMissed: { backgroundColor: COLORS.paleCoral },
  statusPillCancelled: { backgroundColor: "#ECEDEA" },
  statusPillText: { color: COLORS.ink, fontSize: 8, fontWeight: "800", letterSpacing: 0.6 },
  conflict: { backgroundColor: COLORS.paleCoral, borderRadius: 8, padding: 7, marginTop: 9 },
  conflictText: { color: "#A84F39", fontSize: 10, fontWeight: "600" },
  taskActions: { flexDirection: "row", gap: 7, marginTop: 11 },
  miniAction: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  miniActionText: { color: COLORS.green, fontSize: 10, fontWeight: "700" },
  cancelText: { color: COLORS.coral, paddingHorizontal: 3 },
  undoAction: { backgroundColor: COLORS.paleGreen, borderColor: "#C9D9CE" },
  undoActionText: { color: COLORS.green, fontSize: 10, fontWeight: "700" },
  empty: { backgroundColor: COLORS.white, borderRadius: 18, padding: 24, alignItems: "center" },
  emptyTitle: { color: COLORS.ink, fontWeight: "700", fontSize: 16 },
  emptyText: { color: COLORS.muted, fontSize: 12, marginTop: 5, textAlign: "center" },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 18,
    padding: 15,
    marginTop: 14,
  },
  exportIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    textAlign: "center",
    lineHeight: 36,
    backgroundColor: COLORS.paleGreen,
    color: COLORS.green,
    fontSize: 18,
    fontWeight: "700",
  },
  exportCopy: { flex: 1, marginLeft: 11 },
  exportTitle: { color: COLORS.ink, fontSize: 14, fontWeight: "700" },
  exportSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  chevron: { color: COLORS.muted, fontSize: 25 },
  footerNote: { color: "#8A948D", fontSize: 10, textAlign: "center", lineHeight: 15, margin: 18 },
  banner: {
    position: "absolute",
    bottom: 24,
    left: 34,
    right: 34,
    backgroundColor: COLORS.ink,
    borderRadius: 15,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  bannerText: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  modalPage: { flex: 1, backgroundColor: COLORS.paper, paddingHorizontal: 18 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 18,
    paddingBottom: 20,
  },
  modalCancel: { color: COLORS.green, fontSize: 14, fontWeight: "600" },
  modalTitle: { color: COLORS.ink, fontSize: 17, fontWeight: "800" },
  modalHeaderSpacer: { width: 42 },
  sourceTabs: { flexDirection: "row", gap: 8, marginBottom: 12 },
  sourceTab: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#E5E6DF",
  },
  sourceTabActive: { backgroundColor: COLORS.lime },
  sourceTabText: { color: COLORS.ink, fontWeight: "700", fontSize: 12 },
  importTab: {
    minWidth: 74,
    alignItems: "center",
    backgroundColor: COLORS.green,
    marginLeft: "auto",
  },
  importTabText: { color: COLORS.white, fontWeight: "800", fontSize: 12 },
  jsonInput: {
    flex: 1,
    backgroundColor: COLORS.ink,
    color: "#E9F0EB",
    borderRadius: 18,
    padding: 16,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
    lineHeight: 17,
  },
  sampleLink: { color: COLORS.green, textAlign: "center", fontWeight: "700", fontSize: 12, padding: 12 },
  modalPrimary: {
    backgroundColor: COLORS.green,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    marginVertical: 16,
  },
  modalPrimaryText: { color: COLORS.white, fontWeight: "800", fontSize: 14 },
  disabled: { opacity: 0.6 },
  urlPanel: { flex: 1, backgroundColor: COLORS.white, borderRadius: 20, padding: 18 },
  fieldLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  urlInput: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 12,
    padding: 13,
    color: COLORS.ink,
    marginTop: 9,
    fontSize: 13,
  },
  urlHint: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 10 },
  exportHelp: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(12,20,15,0.44)", justifyContent: "flex-end" },
  deferSheet: {
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
    paddingBottom: 34,
  },
  sheetHandle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C7CCC8",
    alignSelf: "center",
    marginBottom: 20,
  },
  deferEyebrow: { color: COLORS.green, fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  deferTitle: { color: COLORS.ink, fontSize: 21, fontWeight: "800", marginTop: 7, marginBottom: 10 },
  deferActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  deferCancel: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  deferCancelText: { color: COLORS.muted, fontWeight: "700", fontSize: 12 },
  deferConfirm: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.green,
  },
  deferConfirmText: { color: COLORS.white, fontWeight: "800", fontSize: 12 },
});
