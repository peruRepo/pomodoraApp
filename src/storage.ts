import AsyncStorage from "@react-native-async-storage/async-storage";
import { PomodoroPlan } from "./types";

const PLAN_KEY = "@flow/plan/v1";

export async function loadPlan(): Promise<PomodoroPlan | null> {
  const raw = await AsyncStorage.getItem(PLAN_KEY);
  return raw ? (JSON.parse(raw) as PomodoroPlan) : null;
}

export async function savePlan(plan: PomodoroPlan) {
  await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(plan));
}
