-- 004: o administrador pode aprovar, recusar, cancelar e desfazer trocas casadas
create or replace function admin_gerenciar_troca(p_troca uuid, p_acao text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare t trocas;
begin
  if not is_admin() then raise exception 'Apenas administradores'; end if;
  select * into t from trocas where id = p_troca for update;
  if not found then raise exception 'Troca não encontrada'; end if;

  if p_acao = 'aceitar' then
    if t.status <> 'pendente' then raise exception 'Só trocas pendentes podem ser aprovadas'; end if;
    if not (_tipo(t.solicitante_id, t.data_solicitante) = 'T' and _tipo(t.solicitante_id, t.data_destinatario) = 'F'
        and _tipo(t.destinatario_id, t.data_solicitante) = 'F' and _tipo(t.destinatario_id, t.data_destinatario) = 'T') then
      raise exception 'A escala mudou e a troca não é mais possível'; end if;
    update plantoes set tipo = 'F', origem_troca = t.id, atualizado_em = now() where analista_id = t.solicitante_id and data = t.data_solicitante;
    update plantoes set tipo = 'T', origem_troca = t.id, atualizado_em = now() where analista_id = t.solicitante_id and data = t.data_destinatario;
    update plantoes set tipo = 'T', origem_troca = t.id, atualizado_em = now() where analista_id = t.destinatario_id and data = t.data_solicitante;
    update plantoes set tipo = 'F', origem_troca = t.id, atualizado_em = now() where analista_id = t.destinatario_id and data = t.data_destinatario;
    update trocas set status = 'aceito', respondido_em = now() where id = t.id;

  elsif p_acao in ('recusar', 'cancelar') then
    if t.status <> 'pendente' then raise exception 'Só trocas pendentes podem ser alteradas'; end if;
    update trocas set status = (case when p_acao = 'recusar' then 'recusado' else 'cancelado' end)::status_troca, respondido_em = now() where id = t.id;

  elsif p_acao = 'desfazer' then
    if t.status <> 'aceito' then raise exception 'Só trocas aceitas podem ser desfeitas'; end if;
    if not (_tipo(t.solicitante_id, t.data_solicitante) = 'F' and _tipo(t.solicitante_id, t.data_destinatario) = 'T'
        and _tipo(t.destinatario_id, t.data_solicitante) = 'T' and _tipo(t.destinatario_id, t.data_destinatario) = 'F') then
      raise exception 'A escala foi alterada depois da troca. Ajuste manualmente no Modo edição'; end if;
    update plantoes set tipo = 'T', origem_troca = null, atualizado_em = now() where analista_id = t.solicitante_id and data = t.data_solicitante;
    update plantoes set tipo = 'F', origem_troca = null, atualizado_em = now() where analista_id = t.solicitante_id and data = t.data_destinatario;
    update plantoes set tipo = 'F', origem_troca = null, atualizado_em = now() where analista_id = t.destinatario_id and data = t.data_solicitante;
    update plantoes set tipo = 'T', origem_troca = null, atualizado_em = now() where analista_id = t.destinatario_id and data = t.data_destinatario;
    update trocas set status = 'cancelado', respondido_em = now() where id = t.id;

  else raise exception 'Ação inválida';
  end if;
end $$;

revoke all on function admin_gerenciar_troca(uuid, text) from public, anon;
grant execute on function admin_gerenciar_troca(uuid, text) to authenticated;
