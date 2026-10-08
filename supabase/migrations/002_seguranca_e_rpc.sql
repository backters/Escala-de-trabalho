-- SEGURANÇA: esconder o hash do PIN e proteger a tabela admins --------------
alter table analistas add column if not exists tem_pin boolean generated always as (pin_hash is not null) stored;
revoke select on analistas from anon, authenticated;
grant select (id, nome, ativo, offset_ciclo, criado_em, tem_pin) on analistas to anon, authenticated;

alter table admins enable row level security;
create policy "admin ve o proprio registro" on admins for select using (user_id = auth.uid());

-- FUNÇÕES INTERNAS ------------------------------------------------------------
create or replace function _pin_ok(p_id uuid, p_pin text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from analistas
    where id = p_id and ativo and pin_hash is not null and pin_hash = crypt(p_pin, pin_hash));
$$;

create or replace function _tipo(p_id uuid, p_data date) returns tipo_dia
language sql stable security definer set search_path = public as $$
  select tipo from plantoes where analista_id = p_id and data = p_data;
$$;

create or replace function _troca_valida(sol uuid, dest uuid, dsol date, ddest date) returns boolean
language sql stable security definer set search_path = public as $$
  select _tipo(sol, dsol) = 'T' and _tipo(sol, ddest) = 'F'
     and _tipo(dest, dsol) = 'F' and _tipo(dest, ddest) = 'T'
     and dsol >= (now() at time zone 'America/Sao_Paulo')::date
     and ddest >= (now() at time zone 'America/Sao_Paulo')::date;
$$;
revoke all on function _pin_ok(uuid, text), _tipo(uuid, date), _troca_valida(uuid, uuid, date, date) from public, anon, authenticated;

-- LOGIN (o primeiro acesso cria o PIN; o admin pode resetar) --------------------
create or replace function login_analista(p_id uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^\d{4}$' then return false; end if;
  update analistas set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_id and ativo and pin_hash is null;
  return _pin_ok(p_id, p_pin);
end $$;

-- TROCA CASADA ------------------------------------------------------------------
create or replace function solicitar_troca(p_id uuid, p_pin text, p_dest uuid, p_dsol date, p_ddest date) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _pin_ok(p_id, p_pin) then raise exception 'PIN inválido'; end if;
  if p_id = p_dest or not _troca_valida(p_id, p_dest, p_dsol, p_ddest) then
    raise exception 'Troca inválida para essas datas'; end if;
  insert into trocas (solicitante_id, destinatario_id, data_solicitante, data_destinatario)
  values (p_id, p_dest, p_dsol, p_ddest);
end $$;

create or replace function responder_troca(p_id uuid, p_pin text, p_troca uuid, p_aceitar boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare t trocas;
begin
  if not _pin_ok(p_id, p_pin) then raise exception 'PIN inválido'; end if;
  select * into t from trocas where id = p_troca and destinatario_id = p_id and status = 'pendente' for update;
  if not found then raise exception 'Pedido não encontrado ou já respondido'; end if;
  if p_aceitar then
    if not _troca_valida(t.solicitante_id, t.destinatario_id, t.data_solicitante, t.data_destinatario) then
      raise exception 'A escala mudou e a troca não é mais possível'; end if;
    update plantoes set tipo = 'F', origem_troca = t.id, atualizado_em = now() where analista_id = t.solicitante_id and data = t.data_solicitante;
    update plantoes set tipo = 'T', origem_troca = t.id, atualizado_em = now() where analista_id = t.solicitante_id and data = t.data_destinatario;
    update plantoes set tipo = 'T', origem_troca = t.id, atualizado_em = now() where analista_id = t.destinatario_id and data = t.data_solicitante;
    update plantoes set tipo = 'F', origem_troca = t.id, atualizado_em = now() where analista_id = t.destinatario_id and data = t.data_destinatario;
  end if;
  update trocas set status = (case when p_aceitar then 'aceito' else 'recusado' end)::status_troca, respondido_em = now() where id = t.id;
end $$;

create or replace function cancelar_troca(p_id uuid, p_pin text, p_troca uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _pin_ok(p_id, p_pin) then raise exception 'PIN inválido'; end if;
  update trocas set status = 'cancelado', respondido_em = now()
   where id = p_troca and solicitante_id = p_id and status = 'pendente';
end $$;

-- NOTIFICAÇÕES -------------------------------------------------------------------
create or replace function obter_config(p_id uuid, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _pin_ok(p_id, p_pin) then raise exception 'PIN inválido'; end if;
  return (select json_build_object('ativa', coalesce(c.ativa, false), 'horario', coalesce(c.horario, '15:00')::text)
          from (select 1) x left join config_notificacao c on c.analista_id = p_id);
end $$;

create or replace function salvar_config(p_id uuid, p_pin text, p_ativa boolean, p_horario time,
  p_endpoint text default null, p_p256dh text default null, p_auth text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _pin_ok(p_id, p_pin) then raise exception 'PIN inválido'; end if;
  insert into config_notificacao (analista_id, ativa, horario) values (p_id, p_ativa, p_horario)
  on conflict (analista_id) do update set ativa = excluded.ativa, horario = excluded.horario, atualizado_em = now();
  if p_ativa and p_endpoint is not null then
    insert into push_subscriptions (analista_id, endpoint, p256dh, auth) values (p_id, p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set analista_id = excluded.analista_id, p256dh = excluded.p256dh, auth = excluded.auth;
  elsif not p_ativa and p_endpoint is not null then
    delete from push_subscriptions where endpoint = p_endpoint and analista_id = p_id;
  end if;
end $$;

grant execute on function login_analista, solicitar_troca, responder_troca, cancelar_troca, obter_config, salvar_config to anon, authenticated;
