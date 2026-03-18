import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_HOUSEHOLD_ID || ''

export type Household = {
  id: string
  name: string
  person_a_name: string
  person_b_name: string
  telegram_chat_id: string | null
  telegram_bot_token: string | null
  notify_days_before: number
  calendar_url_a: string | null
  calendar_url_b: string | null
  created_at: string
}

export type Chore = {
  id: string
  household_id: string
  name: string
  room: string
  icon: string
  assigned: 'A' | 'B' | 'Both'
  default_freq_days: number
  learned_freq_days: number | null
  confidence_pct: number
  is_active: boolean
  created_at: string
  last_completed?: string | null
  completions_count?: number
}

export type ChoreCompletion = {
  id: string
  chore_id: string
  completed_by: string
  completed_at: string
  notes: string | null
}

export type Bill = {
  id: string
  household_id: string
  name: string
  icon: string
  color: string
  provider: string | null
  bill_type: string
  amount_pence: number
  due_day_of_month: number | null
  renewal_date: string | null
  is_active: boolean
  frequency: 'monthly' | 'annually'
}

export type BillDeal = {
  id: string
  bill_id: string
  provider: string
  monthly_amount_pence: number
  saving_pence: number
  detail: string | null
  url: string | null
  searched_at: string
  is_dismissed: boolean
}

export type MealPlan = {
  id: string
  household_id: string
  plan_date: string
  slot: 'lunch' | 'dinner'
  meal_name: string
  meal_tag: string
  prep_time_mins: number
  source: string | null
  recipe: string | null
  ingredients: { item: string; amount: string }[] | null
  shopping_tips: string | null
}

export type FavoriteMeal = {
  id: string
  household_id: string
  meal_name: string
  meal_tag: string
  prep_time_mins: number
  source: string | null
  recipe: string | null
  ingredients: { item: string; amount: string }[] | null
  created_at: string
}

export type CupboardItem = {
  id: string
  household_id: string
  item: string
  quantity: string | null
  notes: string | null
  expires_on: string | null
  created_at: string
}

export type ShoppingCheck = {
  id: string
  household_id: string
  week_start: string
  store: string
  item: string
  is_checked: boolean
  bought_amount: string | null
  added_to_cupboard: boolean
  updated_at: string
}

export type Notification = {
  id: string
  household_id: string
  type: string
  title: string
  body: string
  icon: string
  is_read: boolean
  metadata: Record<string, any> | null
  created_at: string
}

export async function getHousehold() {
  // Try with HOUSEHOLD_ID first, fall back to first row if env var missing/wrong
  if (HOUSEHOLD_ID) {
    const { data } = await supabase
      .from('households')
      .select('*')
      .eq('id', HOUSEHOLD_ID)
      .single()
    if (data) return data as Household
  }
  // Fallback: just grab the first household
  const { data } = await supabase
    .from('households')
    .select('*')
    .limit(1)
    .single()
  return data as Household | null
}

export async function getChores() {
  const { data } = await supabase
    .from('chores')
    .select('*, chore_completions(id, completed_at, completed_by)')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('is_active', true)
    .order('created_at')

  return (data || []).map((c: any) => ({
    ...c,
    last_completed: c.chore_completions?.length
      ? c.chore_completions.sort((a: any, b: any) =>
        new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
      )[0].completed_at
      : null,
    completions_count: c.chore_completions?.length || 0,
    chore_completions: c.chore_completions || [],
  })) as (Chore & { chore_completions: ChoreCompletion[] })[]
}

export async function markChoreDone(choreId: string, completedBy: string = 'Both') {
  const { data, error } = await supabase
    .from('chore_completions')
    .insert({ chore_id: choreId, completed_by: completedBy })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function addChore(chore: Omit<Chore, 'id' | 'household_id' | 'created_at' | 'learned_freq_days' | 'confidence_pct' | 'is_active'>) {
  const { data, error } = await supabase
    .from('chores')
    .insert({ ...chore, household_id: HOUSEHOLD_ID })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateChore(id: string, updates: Partial<Pick<Chore, 'name' | 'room' | 'icon' | 'assigned' | 'default_freq_days'>>) {
  const { data, error } = await supabase
    .from('chores')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteChore(id: string) {
  await supabase.from('chores').update({ is_active: false }).eq('id', id)
}

export async function getBills() {
  const { data } = await supabase
    .from('bills')
    .select('*')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('is_active', true)
    .order('renewal_date', { ascending: true, nullsFirst: false })
  return (data || []) as Bill[]
}

export async function updateBill(id: string, updates: Partial<Omit<Bill, 'id' | 'household_id' | 'is_active'>>) {
  const { data, error } = await supabase
    .from('bills')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteBill(id: string) {
  await supabase.from('bills').update({ is_active: false }).eq('id', id)
}

export async function addBill(bill: Omit<Bill, 'id' | 'household_id' | 'is_active'>) {
  const { data, error } = await supabase
    .from('bills')
    .insert({ ...bill, household_id: HOUSEHOLD_ID })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getDealsForBill(billId: string) {
  const { data } = await supabase
    .from('bill_deals')
    .select('*')
    .eq('bill_id', billId)
    .eq('is_dismissed', false)
    .order('saving_pence', { ascending: false })
  return (data || []) as BillDeal[]
}

export async function saveDeals(billId: string, deals: Omit<BillDeal, 'id' | 'bill_id' | 'searched_at' | 'is_dismissed'>[]) {
  await supabase.from('bill_deals').delete().eq('bill_id', billId)
  const { data } = await supabase
    .from('bill_deals')
    .insert(deals.map(d => ({ ...d, bill_id: billId })))
    .select()
  return data || []
}

export async function getMealPlan(startDate: string, endDate: string) {
  const { data } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('household_id', HOUSEHOLD_ID)
    .gte('plan_date', startDate)
    .lte('plan_date', endDate)
    .order('plan_date')
  return (data || []) as MealPlan[]
}

export async function saveMealPlan(meals: Omit<MealPlan, 'id' | 'household_id' | 'created_at'>[]) {
  const rows = meals.map(m => ({ ...m, household_id: HOUSEHOLD_ID }))
  const { data, error } = await supabase
    .from('meal_plans')
    .upsert(rows, { onConflict: 'household_id,plan_date,slot' })
    .select()
  if (error) throw error
  return data || []
}

export async function getFavoriteMeals() {
  const { data } = await supabase
    .from('meal_favorites')
    .select('*')
    .eq('household_id', HOUSEHOLD_ID)
    .order('created_at', { ascending: false })
  return (data || []) as FavoriteMeal[]
}

export async function addFavoriteMeal(meal: Omit<FavoriteMeal, 'id' | 'household_id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('meal_favorites')
    .upsert({ ...meal, household_id: HOUSEHOLD_ID }, { onConflict: 'household_id,meal_name' })
    .select()
    .single()
  if (error) throw error
  return data as FavoriteMeal
}

export async function removeFavoriteMeal(id: string) {
  await supabase.from('meal_favorites').delete().eq('id', id)
}

export async function getCupboardItems() {
  const { data } = await supabase
    .from('cupboard_items')
    .select('*')
    .eq('household_id', HOUSEHOLD_ID)
    .order('created_at', { ascending: false })
  return (data || []) as CupboardItem[]
}

export async function addCupboardItem(item: Omit<CupboardItem, 'id' | 'household_id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('cupboard_items')
    .insert({ ...item, household_id: HOUSEHOLD_ID })
    .select()
    .single()
  if (error) throw error
  return data as CupboardItem
}

export async function deleteCupboardItem(id: string) {
  await supabase.from('cupboard_items').delete().eq('id', id)
}

export async function deleteCupboardByItem(item: string) {
  await supabase.from('cupboard_items').delete().eq('household_id', HOUSEHOLD_ID).ilike('item', item)
}

export async function updateCupboardItem(id: string, updates: Partial<Pick<CupboardItem, 'quantity' | 'notes' | 'expires_on'>>) {
  const { data, error } = await supabase
    .from('cupboard_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as CupboardItem
}

export async function getShoppingChecks(weekStart: string) {
  const { data } = await supabase
    .from('shopping_checks')
    .select('*')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('week_start', weekStart)
  return (data || []) as ShoppingCheck[]
}

export async function upsertShoppingCheck(
  weekStart: string,
  store: string,
  item: string,
  isChecked: boolean,
  opts?: { boughtAmount?: string | null; addedToCupboard?: boolean }
) {
  const payload: any = {
    household_id: HOUSEHOLD_ID,
    week_start: weekStart,
    store,
    item,
    is_checked: isChecked,
    updated_at: new Date().toISOString(),
  }
  if (opts?.boughtAmount !== undefined) payload.bought_amount = opts.boughtAmount
  if (opts?.addedToCupboard !== undefined) payload.added_to_cupboard = opts.addedToCupboard
  const { data, error } = await supabase
    .from('shopping_checks')
    .upsert(payload, { onConflict: 'household_id,week_start,store,item' })
    .select()
    .single()
  if (error) throw error
  return data as ShoppingCheck
}

export async function clearShoppingChecks(weekStart: string) {
  await supabase.from('shopping_checks')
    .delete()
    .eq('household_id', HOUSEHOLD_ID)
    .eq('week_start', weekStart)
}

export async function getNotifications(limit = 30) {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('household_id', HOUSEHOLD_ID)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data || []) as Notification[]
}

export async function markNotificationRead(id: string) {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id)
}

export async function markAllNotificationsRead() {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('household_id', HOUSEHOLD_ID)
    .eq('is_read', false)
}

export function effectiveFreq(chore: Chore) {
  return chore.learned_freq_days ?? chore.default_freq_days
}

export function nextDueDate(chore: Chore & { last_completed?: string | null }) {
  if (!chore.last_completed) return new Date()
  const freq = effectiveFreq(chore)
  const last = new Date(chore.last_completed)
  last.setDate(last.getDate() + freq)
  return last
}

export function daysUntilDue(chore: Chore & { last_completed?: string | null }) {
  const due = nextDueDate(chore)
  return Math.round((due.getTime() - Date.now()) / 86400000)
}

export function choreStatus(chore: Chore & { last_completed?: string | null }) {
  const d = daysUntilDue(chore)
  if (d < 0) return 'overdue'
  if (d <= 2) return 'due-soon'
  return 'ok'
}
