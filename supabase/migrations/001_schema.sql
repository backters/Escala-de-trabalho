create extension if not exists "pgcrypto";

create table analistas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  pin_hash text,
  ativo boolean not null default true,
  offset_ciclo smallint not null default 0 check (offset_ciclo between 0 and 5),
  criado_em timestamptz not null default now()
);

create type tipo_dia as enum ('T', 'F');
create table plantoes (
  id uuid primary key default gen_random_uuid(),
  analista_id uuid not null references analistas(id) on delete cascade,
  data date not null,
  tipo tipo_dia not null,
  observacao text,
  origem_troca uuid,
  atualizado_em timestamptz not null default now(),
  unique (analista_id, data)
);
create index idx_plantoes_data on plantoes (data);

create type status_troca as enum ('pendente', 'aceito', 'recusado', 'cancelado');
create table trocas (
  id uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references analistas(id),
  destinatario_id uuid not null references analistas(id),
  -- solicitante TRABALHA em data_solicitante (quer folgar) e FOLGA em data_destinatario (passa a trabalhar);
  -- destinatário faz o inverso.
  data_solicitante date not null,
  data_destinatario date not null,
  status status_troca not null default 'pendente',
  criado_em timestamptz not null default now(),
  respondido_em timestamptz,
  check (solicitante_id <> destinatario_id)
);

create table config_notificacao (
  analista_id uuid primary key references analistas(id) on delete cascade,
  ativa boolean not null default false,
  horario time not null default '15:00',
  atualizado_em timestamptz not null default now()
);
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  analista_id uuid not null references analistas(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);
create table admins (user_id uuid primary key references auth.users(id) on delete cascade);

create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

alter table analistas enable row level security;
alter table plantoes enable row level security;
alter table trocas enable row level security;
alter table config_notificacao enable row level security;
alter table push_subscriptions enable row level security;

create policy "ler analistas" on analistas for select using (true);
create policy "ler plantoes" on plantoes for select using (true);
create policy "ler trocas" on trocas for select using (true);
create policy "admin escreve analistas" on analistas for all using (is_admin()) with check (is_admin());
create policy "admin escreve plantoes" on plantoes for all using (is_admin()) with check (is_admin());
create policy "admin escreve trocas" on trocas for all using (is_admin()) with check (is_admin());

alter publication supabase_realtime add table plantoes, trocas;
