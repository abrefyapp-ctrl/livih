-- Notificação de teste no feminino (revisão dos manuais da Ajuda, 16/11): dizia "Notificações do Livih ativadas"; o
-- produto é sempre "a Livih". Igual a 20261009160000, só o texto.
create or replace function public.push_testar() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'faça login'; end if;
  insert into public.push_fila (user_id, titulo, corpo)
  values (auth.uid(), 'Notificações da Livih ativadas', 'É assim que você vai saber quando um cliente aguardar atendimento.');
end $$;
