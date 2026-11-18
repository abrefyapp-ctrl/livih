-- Logo da empresa para o usuário do balcão (docs/balcao.md, teste de 18/11).
--
-- O arquivo do logo só abria para quem é da equipe ("logos: membros veem"), e o usuário do balcão não é: no teste
-- da F7 Tech o cabeçalho mostrou as iniciais e o navegador registrou erro ao pedir o link do logo. Ver o logo da
-- própria empresa é o mesmo que ele já vê na tela (o nome e os CNPJs); subir, trocar e apagar seguem com dono e admin.

create policy "logos: balcão vê" on storage.objects for select to authenticated
  using (bucket_id = 'logos' and public.eh_balcao(public.org_do_caminho(name)));
