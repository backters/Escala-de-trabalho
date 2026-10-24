-- 005: o admin cria ou edita trocas casadas direto, sem aceite das analistas (requer a 004 já aplicada)
create or replace function admin_trocar_direto(p_sol uuid, p_dest uuid, p_dsol date, p_ddest date, p_editar uuid default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare ant trocas; nova uuid;
begin
  if not is_admin() then raise exception 'Apenas administradores'; end if;
  if p_sol = p_dest then raise exception 'Escolha duas analistas diferentes'; end if;
  if (select turno from analistas where id = p_sol) is distinct from (select turno from analistas where id = p_dest) then
    raise exception 'A troca só é permitida entre analistas do mesmo turno'; end if;

  -- Edição: primeiro desfaz a troca antiga (pendente só é cancelada; aceita devolve os dias)
  if p_editar is not null then
    select * into ant from trocas where id = p_editar for update;
    if not found then raise exception 'Troca não encontrada'; end if;
    if ant.status = 'aceito' then
      if not (_tipo(ant.solicitante_id, ant.data_solicitante) = 'F' and _tipo(ant.solicitante_id, ant.data_destinatario) = 'T'
          and _tipo(ant.destinatario_id, ant.data_solicitante) = 'T' and _tipo(ant.destinatario_id, ant.data_destinatario) = 'F') then
        raise exception 'A escala foi alterada depois da troca. Ajuste manualmente no Modo edição'; end if;
      update plantoes set tipo = 'T', origem_troca = null, atualizado_em = now() where analista_id = ant.solicitante_id and data = ant.data_solicitante;
      update plantoes set tipo = 'F', origem_troca = null, atualizado_em = now() where analista_id = ant.solicitante_id and data = ant.data_destinatario;
      update plantoes set tipo = 'F', origem_troca = null, atualizado_em = now() where analista_id = ant.destinatario_id and data = ant.data_solicitante;
      update plantoes set tipo = 'T', origem_troca = null, atualizado_em = now() where analista_id = ant.destinatario_id and data = ant.data_destinatario;
    elsif ant.status <> 'pendente' then
      raise exception 'Só trocas pendentes ou aceitas podem ser editadas';
    end if;
    update trocas set status = 'cancelado', respondido_em = now() where id = ant.id;
  end if;

  -- Nova troca: quem folga hoje trabalha, e vice-versa
  if not (_tipo(p_sol, p_dsol) = 'T' and _tipo(p_sol, p_ddest) = 'F'
      and _tipo(p_dest, p_dsol) = 'F' and _tipo(p_dest, p_ddest) = 'T') then
    raise exception 'As datas não são compatíveis com a escala das duas analistas'; end if;

  insert into trocas (solicitante_id, destinatario_id, data_solicitante, data_destinatario, status, respondido_em)
  values (p_sol, p_dest, p_dsol, p_ddest, 'aceito', now()) returning id into nova;

  update plantoes set tipo = 'F', origem_troca = nova, atualizado_em = now() where analista_id = p_sol and data = p_dsol;
  update plantoes set tipo = 'T', origem_troca = nova, atualizado_em = now() where analista_id = p_sol and data = p_ddest;
  update plantoes set tipo = 'T', origem_troca = nova, atualizado_em = now() where analista_id = p_dest and data = p_dsol;
  update plantoes set tipo = 'F', origem_troca = nova, atualizado_em = now() where analista_id = p_dest and data = p_ddest;
  return nova;
end $$;

revoke all on function admin_trocar_direto(uuid, uuid, date, date, uuid) from public, anon;
grant execute on function admin_trocar_direto(uuid, uuid, date, date, uuid) to authenticated;
