import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { PomodoroTask } from "./types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationAccess() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("tasks", {
      name: "Task timers",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function syncNotifications(tasks: PomodoroTask[]) {
  const granted = await requestNotificationAccess();
  if (!granted) return false;

  await Notifications.setNotificationCategoryAsync("task-start", [
    {
      identifier: "ACCEPT",
      buttonTitle: "Start",
      options: { opensAppToForeground: false },
    },
    {
      identifier: "DEFER",
      buttonTitle: "Defer",
      options: { opensAppToForeground: true },
    },
    {
      identifier: "CANCEL",
      buttonTitle: "Cancel",
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync("task-end", [
    {
      identifier: "COMPLETE",
      buttonTitle: "Complete",
      options: { opensAppToForeground: false },
    },
    {
      identifier: "DEFER",
      buttonTitle: "Defer",
      options: { opensAppToForeground: true },
    },
    {
      identifier: "CANCEL",
      buttonTitle: "Cancel",
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);

  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  const schedulable = tasks
    .filter(
      (task) =>
        task.status === "scheduled" &&
        Date.parse(task.startAt) > now &&
        Date.parse(task.startAt) < now + 60 * 24 * 60 * 60_000,
    )
    // iOS retains at most 64 pending local notifications. Each task uses two.
    .slice(0, 30);

  for (const task of schedulable) {
    const start = new Date(task.startAt);
    const end = new Date(start.getTime() + task.durationMinutes * 60_000);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Start: ${task.title}`,
        body: `${task.durationMinutes} min focus block`,
        data: { taskId: task.id, event: "start" },
        categoryIdentifier: "task-start",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: start },
    });
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Time's up: ${task.title}`,
        body: "Open Flow to complete, defer, or cancel.",
        data: { taskId: task.id, event: "end" },
        categoryIdentifier: "task-end",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: end },
    });
  }
  return true;
}
