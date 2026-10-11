-- 003: turnos (diurno/noturno) + escala do SAME Diurno
-- Faça backup (Table Editor > exportar CSV) ou rode antes no projeto de testes.

create type turno as enum ('diurno', 'noturno');
alter table analistas add column turno turno not null default 'noturno';  -- as atuais ficam noturnas
grant select (turno) on analistas to anon, authenticated;

-- Troca casada só entre analistas do mesmo turno
create or replace function solicitar_troca(p_id uuid, p_pin text, p_dest uuid, p_dsol date, p_ddest date) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _pin_ok(p_id, p_pin) then raise exception 'PIN inválido'; end if;
  if (select turno from analistas where id = p_id) is distinct from (select turno from analistas where id = p_dest) then
    raise exception 'A troca só é permitida entre analistas do mesmo turno'; end if;
  if p_id = p_dest or not _troca_valida(p_id, p_dest, p_dsol, p_ddest) then
    raise exception 'Troca inválida para essas datas'; end if;
  insert into trocas (solicitante_id, destinatario_id, data_solicitante, data_destinatario)
  values (p_id, p_dest, p_dsol, p_ddest);
end $$;

-- SAME Diurno (07h às 19h). Mesma data-âncora do noturno (07/10/2026).
insert into analistas (nome, offset_ciclo, turno) values
  ('Rodrigo', 4, 'diurno'), ('Aya', 3, 'diurno'), ('Giullia', 2, 'diurno'),
  ('Laysa', 1, 'diurno'), ('Melissa', 0, 'diurno'), ('Manu', 5, 'diurno')
on conflict (nome) do update set offset_ciclo = excluded.offset_ciclo, turno = excluded.turno;

-- Plantões de 07/10/2026 a 31/01/2027 (mesmo período do noturno)
insert into plantoes (analista_id, data, tipo)
select a.id, d::date,
  case when (((d::date - c.valor::date) + a.offset_ciclo) % 6 + 6) % 6 < 4 then 'T' else 'F' end::tipo_dia
from analistas a
cross join generate_series('2026-10-07'::date, '2027-01-31'::date, '1 day') d
cross join (select valor from config_escala where chave = 'data_ancora') c
where a.turno = 'diurno'
on conflict (analista_id, data) do nothing;
