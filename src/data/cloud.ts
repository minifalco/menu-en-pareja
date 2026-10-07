import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import type { Ingredient, ManualShoppingItem, PlannedMeal } from '../domain/types';

const authStorage = Platform.OS === 'web' ? AsyncStorage : {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const cloudEnabled = Boolean(url && anonKey);

export const supabase = cloudEnabled
  ? createClient(url, anonKey, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

export interface Recipe {
  id: string;
  title: string;
  ingredients: Ingredient[];
  note: string;
}

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
}

export interface WeekData {
  recipes: Recipe[];
  meals: PlannedMeal[];
  checks: Record<string, boolean>;
  manualItems: ManualShoppingItem[];
}

export const emptyWeek = (): WeekData => ({ recipes: [], meals: [], checks: {}, manualItems: [] });

export async function loadWeek(householdId: string, weekStart: string): Promise<WeekData> {
  if (!supabase) return emptyWeek();
  const [recipesRes, mealsRes, checksRes, manualRes] = await Promise.all([
    supabase.from('recipes').select('id,title,ingredients,note').eq('household_id', householdId).order('title'),
    supabase.from('planned_meals').select('id,title,day_date,slot,ingredients').eq('household_id', householdId).eq('week_start', weekStart),
    supabase.from('shopping_checks').select('item_key,checked').eq('household_id', householdId).eq('week_start', weekStart),
    supabase.from('manual_shopping_items').select('id,name,quantity,unit,checked').eq('household_id', householdId).eq('week_start', weekStart),
  ]);
  for (const result of [recipesRes, mealsRes, checksRes, manualRes]) if (result.error) throw result.error;
  const checks: Record<string, boolean> = {};
  for (const row of checksRes.data ?? []) checks[row.item_key] = row.checked;
  return {
    recipes: (recipesRes.data ?? []) as Recipe[],
    meals: (mealsRes.data ?? []).map(row => ({ id: row.id, title: row.title, day: row.day_date, slot: row.slot, ingredients: row.ingredients })) as PlannedMeal[],
    checks,
    manualItems: (manualRes.data ?? []).map(row => ({ id: row.id, name: row.name, quantity: row.quantity ?? undefined, unit: row.unit ?? undefined, checked: row.checked })) as ManualShoppingItem[],
  };
}

export async function createHousehold(name: string, code: string): Promise<Household> {
  if (!supabase) throw new Error('Falta configurar el servidor gratuito de sincronización.');
  const { data, error } = await supabase.rpc('create_household', { p_name: name, p_code: code });
  if (error) throw error;
  return { id: data, name, inviteCode: code };
}

export async function joinHousehold(code: string): Promise<Household> {
  if (!supabase) throw new Error('Falta configurar el servidor gratuito de sincronización.');
  const { data, error } = await supabase.rpc('join_household', { p_code: code.trim().toUpperCase() });
  if (error) throw error;
  const { data: household, error: readError } = await supabase.from('households').select('id,name,invite_code').eq('id', data).single();
  if (readError) throw readError;
  return { id: household.id, name: household.name, inviteCode: household.invite_code };
}

export async function listMyHouseholds(): Promise<Household[]> {
  if (!supabase) return [];
  const { data: memberships, error } = await supabase.from('household_members').select('household_id');
  if (error) throw error;
  if (!memberships?.length) return [];
  const { data: rows, error: readError } = await supabase.from('households').select('id,name,invite_code').in('id', memberships.map(row => row.household_id));
  if (readError) throw readError;
  return (rows ?? []).map(row => ({ id: row.id, name: row.name, inviteCode: row.invite_code }));
}

export async function addRecipe(householdId: string, recipe: Omit<Recipe, 'id'>): Promise<Recipe> {
  const { data, error } = await supabase!.from('recipes').insert({ household_id: householdId, ...recipe }).select('id,title,ingredients,note').single();
  if (error) throw error;
  return data as Recipe;
}

export async function addMeal(householdId: string, weekStart: string, meal: PlannedMeal): Promise<void> {
  const { error } = await supabase!.from('planned_meals').insert({
    id: meal.id, household_id: householdId, week_start: weekStart,
    day_date: meal.day, slot: meal.slot, title: meal.title, ingredients: meal.ingredients,
  });
  if (error) throw error;
}

export async function removeMeal(householdId: string, id: string): Promise<void> {
  const { error } = await supabase!.from('planned_meals').delete().eq('household_id', householdId).eq('id', id);
  if (error) throw error;
}

export async function setShoppingChecked(householdId: string, weekStart: string, key: string, checked: boolean): Promise<void> {
  const { error } = await supabase!.from('shopping_checks').upsert({ household_id: householdId, week_start: weekStart, item_key: key, checked }, { onConflict: 'household_id,week_start,item_key' });
  if (error) throw error;
}

export async function addManualItem(householdId: string, weekStart: string, item: ManualShoppingItem): Promise<void> {
  const { error } = await supabase!.from('manual_shopping_items').insert({
    id: item.id, household_id: householdId, week_start: weekStart,
    name: item.name, quantity: item.quantity ?? null, unit: item.unit ?? null, checked: false,
  });
  if (error) throw error;
}

export async function setManualChecked(householdId: string, id: string, checked: boolean): Promise<void> {
  const { error } = await supabase!.from('manual_shopping_items').update({ checked }).eq('household_id', householdId).eq('id', id);
  if (error) throw error;
}

export async function removeManualItem(householdId: string, id: string): Promise<void> {
  const { error } = await supabase!.from('manual_shopping_items').delete().eq('household_id', householdId).eq('id', id);
  if (error) throw error;
}

export async function saveLocal(key: string, data: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(data));
}

export async function loadLocal<T = WeekData>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) as T : null;
}
