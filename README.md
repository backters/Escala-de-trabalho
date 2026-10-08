# Escala 4X2 SAME Noturno (PWA)

React + Vite + Tailwind + Supabase. Funciona offline-first (PWA) em Android e iOS.

## 1. Supabase
1. Crie um projeto em supabase.com.
2. No **SQL Editor**, rode nesta ordem: `supabase/migrations/001_schema.sql`, `002_seguranca_e_rpc.sql` e `supabase/seed.sql`.
3. **Authentication → Users → Add user**: crie o e-mail/senha do administrador. Depois rode:
   `insert into admins select id from auth.users where email = 'SEU@EMAIL';`
4. **Project Settings → API**: copie a URL e a chave `anon`.

## 2. Rodar localmente
```bash
npm install
cp .env.example .env     # preencha URL, chave anon e chave VAPID pública
npx web-push generate-vapid-keys   # gera o par VAPID
npm run dev
```

## 3. Notificações diárias
```bash
supabase login && supabase link --project-ref SEU_REF
supabase secrets set VAPID_PUBLIC=... VAPID_PRIVATE=... VAPID_SUBJECT=mailto:voce@email.com
supabase functions deploy enviar-push-diario
```
No SQL Editor (habilite as extensões `pg_cron` e `pg_net` em Database → Extensions):
```sql
select cron.schedule('push-diario', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://SEU_REF.supabase.co/functions/v1/enviar-push-diario',
    headers := jsonb_build_object('Authorization', 'Bearer SUA_SERVICE_ROLE_KEY'));
$$);
```

## 4. Deploy (Vercel)
Suba para o GitHub, importe na Vercel e cadastre as 3 variáveis `VITE_*`. O HTTPS é automático.

## 5. Instalar no celular
- **Android (Chrome):** menu ⋮ → Instalar aplicativo.
- **iPhone (Safari, iOS 16.4+):** Compartilhar → Adicionar à Tela de Início. Notificações só funcionam depois disso.

## Checklist de testes
- [ ] Grid mostra out/2026 a jan/2027 e o dia de hoje brilha
- [ ] Admin: modo edição altera célula e todos veem na hora (realtime)
- [ ] Troca: A pede, B vê o alerta, aceita e as 4 células mudam (verde)
- [ ] Opções: ligar/desligar notificação e escolher horário
- [ ] Lighthouse → PWA instalável
