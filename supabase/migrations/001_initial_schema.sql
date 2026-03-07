-- ============================================================
-- HEARTH - Household AI Database Schema
-- Run this in your Supabase project SQL editor
-- Project: homebuild
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── HOUSEHOLDS ─────────────────────────────────────────────
create table if not exists households (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'Our Home',
  person_a_name text not null default 'Person A',
  person_b_name text not null default 'Person B',
  telegram_chat_id text,
  telegram_bot_token text,
  notify_days_before int not null default 60,
  created_at timestamptz default now()
);

-- ─── CHORES ─────────────────────────────────────────────────
create table if not exists chores (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  room text not null,
  icon text not null default '🧹',
  assigned text not null default 'Both', -- 'A', 'B', or 'Both'
  default_freq_days int not null default 7,
  learned_freq_days int,                  -- null until enough data
  confidence_pct int not null default 0,  -- 0-100
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- ─── CHORE COMPLETIONS ──────────────────────────────────────
create table if not exists chore_completions (
  id uuid primary key default uuid_generate_v4(),
  chore_id uuid references chores(id) on delete cascade,
  completed_by text not null default 'Both',
  completed_at timestamptz not null default now(),
  notes text
);

-- ─── BILLS ──────────────────────────────────────────────────
create table if not exists bills (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  icon text not null default '💰',
  color text not null default '#C1714F',
  provider text,
  bill_type text not null, -- 'mortgage','energy','broadband','car_insurance','home_insurance','council','other'
  amount_pence int not null default 0,   -- store in pence
  due_day_of_month int,                  -- 1-31
  renewal_date date,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- ─── BILL DEALS ─────────────────────────────────────────────
create table if not exists bill_deals (
  id uuid primary key default uuid_generate_v4(),
  bill_id uuid references bills(id) on delete cascade,
  provider text not null,
  monthly_amount_pence int not null,
  saving_pence int not null,
  detail text,
  url text,
  searched_at timestamptz default now(),
  is_dismissed boolean not null default false
);

-- ─── MEAL PLAN ──────────────────────────────────────────────
create table if not exists meal_plans (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  plan_date date not null,
  slot text not null,  -- 'lunch' or 'dinner'
  meal_name text not null,
  meal_tag text not null default 'quick',   -- 'quick','hf','gc'
  prep_time_mins int not null default 20,
  source text,         -- 'hf','gc', or null
  created_at timestamptz default now(),
  unique(household_id, plan_date, slot)
);

-- ─── NOTIFICATIONS ──────────────────────────────────────────
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  type text not null,  -- 'chore_overdue','chore_due','bill_renewal','deal_found'
  title text not null,
  body text not null,
  icon text default '🔔',
  is_read boolean not null default false,
  metadata jsonb,
  created_at timestamptz default now()
);

-- ─── RLS POLICIES ───────────────────────────────────────────
-- For simplicity with a single-household app, we use anon key with RLS disabled
-- In production you'd add auth and proper RLS
alter table households enable row level security;
alter table chores enable row level security;
alter table chore_completions enable row level security;
alter table bills enable row level security;
alter table bill_deals enable row level security;
alter table meal_plans enable row level security;
alter table notifications enable row level security;

-- Allow anon access (single household app - secure via env var household_id)
create policy "anon_all_households" on households for all using (true) with check (true);
create policy "anon_all_chores" on chores for all using (true) with check (true);
create policy "anon_all_completions" on chore_completions for all using (true) with check (true);
create policy "anon_all_bills" on bills for all using (true) with check (true);
create policy "anon_all_deals" on bill_deals for all using (true) with check (true);
create policy "anon_all_meals" on meal_plans for all using (true) with check (true);
create policy "anon_all_notifications" on notifications for all using (true) with check (true);

-- ─── SEED DATA ──────────────────────────────────────────────
-- Insert default household (copy the ID after running this)
insert into households (name, person_a_name, person_b_name)
values ('Our Home', 'Person A', 'Person B')
returning id;

-- ─── FUNCTIONS ──────────────────────────────────────────────

-- Recalculate learned frequency after each completion
create or replace function recalculate_learned_freq(p_chore_id uuid)
returns void as $$
declare
  v_completions timestamptz[];
  v_intervals int[];
  v_avg_interval numeric;
  v_confidence int;
  v_count int;
  i int;
begin
  -- Get all completions sorted
  select array_agg(completed_at order by completed_at)
  into v_completions
  from chore_completions
  where chore_id = p_chore_id;

  v_count := coalesce(array_length(v_completions, 1), 0);

  if v_count < 2 then
    -- Not enough data yet
    update chores set
      confidence_pct = least(100, v_count * 20)
    where id = p_chore_id;
    return;
  end if;

  -- Calculate intervals
  v_intervals := array[]::int[];
  for i in 2..v_count loop
    v_intervals := v_intervals || array[
      extract(epoch from (v_completions[i] - v_completions[i-1]))::int / 86400
    ];
  end loop;

  -- Average interval
  select avg(x) into v_avg_interval from unnest(v_intervals) x;

  -- Confidence: grows with samples, maxes at 100 after 8+
  v_confidence := least(100, ((v_count - 1) * 14));

  update chores set
    learned_freq_days = round(v_avg_interval),
    confidence_pct = v_confidence
  where id = p_chore_id;
end;
$$ language plpgsql;

-- Trigger to auto-recalculate after each completion
create or replace function trigger_recalc_freq()
returns trigger as $$
begin
  perform recalculate_learned_freq(NEW.chore_id);
  return NEW;
end;
$$ language plpgsql;

create trigger after_chore_completion
after insert on chore_completions
for each row execute function trigger_recalc_freq();

-- Auto-create notifications for overdue chores and renewals
create or replace function generate_notifications(p_household_id uuid)
returns int as $$
declare
  v_chore record;
  v_bill record;
  v_next_due date;
  v_freq int;
  v_days_overdue int;
  v_days_until_renewal int;
  v_count int := 0;
begin
  -- Clear old unread chore notifications older than 1 day
  delete from notifications
  where household_id = p_household_id
    and type in ('chore_overdue','chore_due')
    and created_at < now() - interval '1 day';

  -- Check each chore
  for v_chore in
    select c.*, cc.last_completed
    from chores c
    left join (
      select chore_id, max(completed_at) as last_completed
      from chore_completions group by chore_id
    ) cc on cc.chore_id = c.id
    where c.household_id = p_household_id and c.is_active
  loop
    if v_chore.last_completed is null then
      continue;
    end if;

    v_freq := coalesce(v_chore.learned_freq_days, v_chore.default_freq_days);
    v_next_due := (v_chore.last_completed + (v_freq || ' days')::interval)::date;
    v_days_overdue := current_date - v_next_due;

    if v_days_overdue > 0 then
      insert into notifications (household_id, type, title, body, icon, metadata)
      values (
        p_household_id, 'chore_overdue',
        v_chore.name || ' is overdue',
        v_days_overdue || ' day' || case when v_days_overdue > 1 then 's' else '' end || ' late · ' || v_chore.room,
        v_chore.icon,
        jsonb_build_object('chore_id', v_chore.id, 'days_overdue', v_days_overdue)
      )
      on conflict do nothing;
      v_count := v_count + 1;
    end if;
  end loop;

  -- Check bills for renewal alerts
  for v_bill in
    select * from bills
    where household_id = p_household_id
      and is_active and renewal_date is not null
  loop
    v_days_until_renewal := v_bill.renewal_date - current_date;

    if v_days_until_renewal <= 60 and v_days_until_renewal > 0 then
      insert into notifications (household_id, type, title, body, icon, metadata)
      values (
        p_household_id, 'bill_renewal',
        v_bill.name || ' renews in ' || v_days_until_renewal || ' days',
        'Current provider: ' || coalesce(v_bill.provider, 'Unknown') || ' · Deals are available',
        v_bill.icon,
        jsonb_build_object('bill_id', v_bill.id, 'days_until', v_days_until_renewal)
      )
      on conflict do nothing;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$ language plpgsql;
