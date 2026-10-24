-- Agent Manager starter schema.
-- Run in Supabase SQL Editor. Review access policies before production.

create extension if not exists pgcrypto;

create table if not exists public.telegram_profiles (
  telegram_user_id bigint primary key,
  language text not null default 'am' check (language in ('am','en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  telegram_user_id bigint unique,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','suspended')),
  language text not null default 'am' check (language in ('am','en')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  suspended_at timestamptz
);

create table if not exists public.betshops (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id),
  username text not null unique,
  password_hash text not null,
  betshop_name text,
  betshop_id text,
  deposit numeric(18,2) not null default 0,
  withdraw numeric(18,2) not null default 0,
  balance numeric(18,2) not null default 0,
  status text not null default 'pending'
    check (status in ('pending','active','rejected','deleted')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null
    check (request_type in ('agent_registration','create_betshop','delete_betshop','reactivate_betshop','password_reset')),
  agent_id uuid references public.agents(id),
  betshop_id uuid references public.betshops(id),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  request_data jsonb not null default '{}'::jsonb,
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_type text not null check (actor_type in ('admin','agent','system')),
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index if not exists betshops_agent_id_idx on public.betshops(agent_id);
create index if not exists betshops_status_idx on public.betshops(status);
create index if not exists admin_requests_status_idx on public.admin_requests(status);
create index if not exists admin_requests_created_at_idx on public.admin_requests(created_at desc);

-- Enable RLS on all tables. The Worker uses the server-side service-role key.
-- NEVER expose that key to agents or put it in frontend/client code.
alter table public.telegram_profiles enable row level security;
alter table public.agents enable row level security;
alter table public.betshops enable row level security;
alter table public.admin_requests enable row level security;
alter table public.audit_logs enable row level security;

-- Intentionally no anon/authenticated policies are created in this starter.
-- All access must go through the server-side Worker after authorization checks.
