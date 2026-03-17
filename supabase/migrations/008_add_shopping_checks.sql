-- Migration: Add shopping checklist persistence

create table if not exists shopping_checks (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  week_start date not null,
  store text not null,
  item text not null,
  is_checked boolean not null default true,
  updated_at timestamptz default now(),
  unique(household_id, week_start, store, item)
);

alter table shopping_checks enable row level security;

create policy "member_all_shopping_checks" on shopping_checks
  for all
  using (exists (
    select 1 from household_members hm
    where hm.household_id = shopping_checks.household_id
      and hm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from household_members hm
    where hm.household_id = shopping_checks.household_id
      and hm.user_id = auth.uid()
  ));
