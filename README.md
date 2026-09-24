# Neon Apex

Jogo 2D de corrida com frontend e backend no mesmo projeto. O login usa somente usuários gravados no banco D1 da Cloudflare.

## Estrutura

- `public/` — frontend do jogo
- `src/worker.js` — backend/API
- `migrations/0001_init.sql` — estrutura do banco
- `wrangler.toml` — configuração do Worker e assets

## Rodar e testar

```bash
npm install
npm run check
npm run dev
```

Para o modo local com banco D1, crie o banco pelo Wrangler ou configure um binding `DB` no ambiente de desenvolvimento.

## Publicar pelo GitHub + Cloudflare

1. Envie esta pasta para um repositório no GitHub.
2. No Cloudflare Dashboard, crie um Worker e conecte o repositório.
3. Crie um banco D1 para o projeto.
4. Em **Bindings**, vincule o banco D1 ao Worker usando exatamente o nome `DB`.
5. Execute o SQL de `migrations/0001_init.sql` no console do D1 (a aplicação também tenta criar as tabelas automaticamente na primeira chamada da API).
6. Faça o deploy.

O projeto não precisa de login Google, Discord ou Steam. Usuários são criados e autenticados diretamente no banco.
