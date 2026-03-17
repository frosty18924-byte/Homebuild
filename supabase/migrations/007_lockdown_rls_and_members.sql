-- Migration: Lock down RLS and add household members

-- Household members mapping (auth users -> household)
create table if not exists household_members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz default now(),
  unique(household_id, user_id)
);

alter table household_members enable row level security;

-- Drop open anon policies

drop policy if exists "anon_all_households" on households;
drop policy if exists "anon_all_chores" on chores;
drop policy if exists "anon_all_completions" on chore_completions;
drop policy if exists "anon_all_bills" on bills;
drop policy if exists "anon_all_deals" on bill_deals;
drop policy if exists "anon_all_meals" on meal_plans;
drop policy if exists "anon_all_notifications" on notifications;
drop policy if exists "anon_all_meal_favorites" on meal_favorites;
drop policy if exists "anon_all_cupboard_items" on cupboard_items;

-- Member-only access policies

create policy "member_select_households" on households
  for select
  using (exists (
    select 1 from household_members hm
    where hm.household_id = households.id
      and hm.user_id = auth.uid()
  ));

create policy "member_update_households" on households
  for update
  using (exists (
    select 1 from household_members hm
    where hm.household_id = households.id
      and hm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from household_members hm
    where hm.household_id = households.id
      and hm.user_id = auth.uid()
  ));

create policy "member_all_chores" on chores
  for all
  using (exists (
    select 1 from household_members hm
    where hm.household_id = chores.household_id
      and hm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from household_members hm
    where hm.household_id = chores.household_id
      and hm.user_id = auth.uid()
  ));

create policy "member_all_bills" on bills
  for all
  using (exists (
    select 1 from household_members hm
    where hm.household_id = bills.household_id
      and hm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from household_members hm
    where hm.household_id = bills.household_id
      and hm.user_id = auth.uid()
  ));

create policy "member_all_meal_plans" on meal_plans
  for all
  using (exists (
    select 1 from household_members hm
    where hm.household_id = meal_plans.household_id
      and hm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from household_members hm
    where hm.household_id = meal_plans.household_id
      and hm.user_id = auth.uid()
  ));

create policy "member_all_meal_favorites" on meal_favorites
  for all
  using (exists (
    select 1 from household_members hm
    where hm.household_id = meal_favorites.household_id
      and hm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from household_members hm
    where hm.household_id = meal_favorites.household_id
      and hm.user_id = auth.uid()
  ));

create policy "member_all_cupboard_items" on cupboard_items
  for all
  using (exists (
    select 1 from household_members hm
    where hm.household_id = cupboard_items.household_id
      and hm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from household_members hm
    where hm.household_id = cupboard_items.household_id
      and hm.user_id = auth.uid()
  ));

create policy "member_all_notifications" on notifications
  for all
  using (exists (
    select 1 from household_members hm
    where hm.household_id = notifications.household_id
      and hm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from household_members hm
    where hm.household_id = notifications.household_id
      and hm.user_id = auth.uid()
  ));

create policy "member_all_completions" on chore_completions
  for all
  using (exists (
    select 1 from chores c
    join household_members hm on hm.household_id = c.household_id
    where c.id = chore_completions.chore_id
      and hm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from chores c
    join household_members hm on hm.household_id = c.household_id
    where c.id = chore_completions.chore_id
      and hm.user_id = auth.uid()
  ));

create policy "member_all_deals" on bill_deals
  for all
  using (exists (
    select 1 from bills b
    join household_members hm on hm.household_id = b.household_id
    where b.id = bill_deals.bill_id
      and hm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from bills b
    join household_members hm on hm.household_id = b.household_id
    where b.id = bill_deals.bill_id
      and hm.user_id = auth.uid()
  ));

create policy "member_select_household_members" on household_members
  for select
  using (user_id = auth.uid());
