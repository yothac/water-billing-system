-- Water billing system schema for Supabase / PostgreSQL.
-- Run this file in the Supabase SQL editor before switching the app to Supabase mode.

create extension if not exists "pgcrypto";

create table if not exists water_settings (
  id text primary key default 'default',
  village_name text not null default 'ระบบจัดเก็บค่าน้ำประปาหมู่บ้าน',
  unit_price numeric not null default 8,
  service_fee numeric not null default 20,
  meter_max_value integer not null default 9999,
  receipt_prefix text default 'WR',
  receipt_book_no text,
  receipt_village_line text,
  default_receipt_day integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_periods (
  id text primary key,
  period_name text not null,
  month integer not null,
  year integer not null,
  status text not null default 'open'
    check (status in ('open', 'closed', 'locked')),
  opened_at timestamptz,
  closed_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, year)
);

create table if not exists water_users (
  id text primary key,
  user_code text not null unique,
  legacy_user_id text,
  full_name text not null,
  address text,
  address_code text,
  village_no text,
  phone text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'cut')),
  user_status text not null default 'ACTIVE'
    check (user_status in ('ACTIVE', 'SERVICE_ONLY', 'CUT')),
  default_billing_mode text not null default 'normal'
    check (
      default_billing_mode in (
        'normal',
        'service_only',
        'meter_replaced',
        'disconnected_no_charge'
      )
    ),
  service_only boolean not null default false,
  cut_meter boolean not null default false,
  service_fee_override numeric,
  last_reading integer not null default 0,
  last_reading_text text,
  last_record_date_label text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists meter_readings (
  id text primary key,
  period_id text not null references billing_periods(id) on delete cascade,
  water_user_id text not null references water_users(id) on delete cascade,
  previous_reading integer not null default 0,
  current_reading integer not null default 0,
  used_units integer not null default 0,
  unit_price numeric not null default 0,
  water_amount numeric not null default 0,
  service_fee numeric not null default 0,
  total_amount numeric not null default 0,
  billing_mode text not null default 'normal'
    check (
      billing_mode in (
        'normal',
        'service_only',
        'meter_replaced',
        'disconnected_no_charge'
      )
    ),
  meter_status text not null default 'normal'
    check (
      meter_status in (
        'normal',
        'backward',
        'rollover',
        'meter_replaced',
        'service_only',
        'disconnected_no_charge',
        'error'
      )
    ),
  old_meter_final_reading integer,
  old_meter_units integer,
  new_meter_units integer,
  is_rollover boolean not null default false,
  is_backward boolean not null default false,
  meter_max_value integer not null default 9999,
  note text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, water_user_id)
);

create table if not exists payments (
  id text primary key,
  bill_id text not null unique,
  period_id text not null references billing_periods(id) on delete cascade,
  water_user_id text not null references water_users(id) on delete cascade,
  reading_id text references meter_readings(id) on delete set null,
  amount numeric not null default 0,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'transfer', 'other')),
  status text not null default 'paid'
    check (status in ('paid', 'cancelled')),
  paid_at timestamptz not null default now(),
  cancelled_at timestamptz,
  receipt_no text,
  receipt_book_no text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  action text not null,
  table_name text,
  old_data jsonb,
  new_data jsonb,
  note text,
  created_at timestamptz not null default now()
);

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_water_settings_updated_at on water_settings;
create trigger update_water_settings_updated_at
before update on water_settings
for each row execute function update_updated_at_column();

drop trigger if exists update_billing_periods_updated_at on billing_periods;
create trigger update_billing_periods_updated_at
before update on billing_periods
for each row execute function update_updated_at_column();

drop trigger if exists update_water_users_updated_at on water_users;
create trigger update_water_users_updated_at
before update on water_users
for each row execute function update_updated_at_column();

drop trigger if exists update_meter_readings_updated_at on meter_readings;
create trigger update_meter_readings_updated_at
before update on meter_readings
for each row execute function update_updated_at_column();

drop trigger if exists update_payments_updated_at on payments;
create trigger update_payments_updated_at
before update on payments
for each row execute function update_updated_at_column();

insert into water_settings (
  id,
  village_name,
  unit_price,
  service_fee,
  meter_max_value,
  receipt_prefix
) values (
  'default',
  'ระบบประปาหมู่บ้าน',
  8,
  20,
  9999,
  'WR'
) on conflict (id) do nothing;

insert into billing_periods (
  id,
  period_name,
  month,
  year,
  status,
  opened_at
) values (
  'period-2569-06',
  'มิถุนายน 2569',
  6,
  2569,
  'open',
  '2026-06-01T00:00:00.000Z'
) on conflict (id) do nothing;

insert into water_users (
  id,
  user_code,
  full_name,
  address,
  village_no,
  phone,
  status,
  user_status,
  default_billing_mode,
  service_only,
  cut_meter,
  service_fee_override,
  last_reading,
  created_at,
  updated_at
) values
  ('user-001', '001', 'นายสมชาย ใจดี', '12', '1', '0800000001', 'active', 'ACTIVE', 'normal', false, false, null, 1898, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
  ('user-002', '002', 'นางสมศรี มีสุข', '15', '1', '0800000002', 'active', 'ACTIVE', 'normal', false, false, null, 231, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
  ('user-003', '003', 'ร้านค้าชุมชน', '20', '1', '0800000003', 'active', 'SERVICE_ONLY', 'service_only', true, false, 20, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
  ('user-004', '004', 'นายทดสอบ มิเตอร์วน', '25', '2', '0800000004', 'active', 'ACTIVE', 'normal', false, false, null, 9998, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
  ('user-005', '005', 'บ้านตัดมิเตอร์', '30', '2', '0800000005', 'cut', 'CUT', 'disconnected_no_charge', false, true, null, 500, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
  ('user-006', '006', 'นางมาลี น้ำใจ', '33', '2', '0800000006', 'active', 'ACTIVE', 'normal', false, false, null, 620, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
  ('user-007', '007', 'นายบุญมี ดีมาก', '40', '3', '0800000007', 'active', 'ACTIVE', 'normal', false, false, null, 100, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')
on conflict (id) do nothing;

create index if not exists idx_water_users_user_code on water_users(user_code);
create index if not exists idx_water_users_full_name on water_users(full_name);
create index if not exists idx_water_users_address on water_users(address);
create index if not exists idx_meter_readings_period_id on meter_readings(period_id);
create index if not exists idx_meter_readings_water_user_id on meter_readings(water_user_id);
create index if not exists idx_payments_period_id on payments(period_id);
create index if not exists idx_payments_water_user_id on payments(water_user_id);
create index if not exists idx_payments_bill_id on payments(bill_id);
