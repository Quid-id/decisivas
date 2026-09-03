# DECISIVAS. Especificação da etapa 9: painel de edição (CMS)

Versão 1, 03/09/2026. Lê-se com o CONTEXTO v3.

## Decisões

- **Quem edita**: a equipe do Projeto Brief, poucas pessoas, sem conta no GitHub. O login é por **e-mail com código de uso único**, pelo Cloudflare Access, numa lista de e-mails autorizados que o Lucas administra no painel do Cloudflare. Sem senha, sem cadastro novo.
- **Onde**: `https://decisivas.com.br/admin`. Só esse caminho fica atrás do Access; o resto do site é público.
- **Como publica**: cada salvamento vira um commit na main, feito pelo Worker com um token do GitHub guardado como segredo. O deploy automático publica em cerca de um minuto. O autor do commit registra o e-mail de quem editou (auditoria), nunca o token.
- **Fonte única**: o painel edita os mesmos arquivos que o build lê (`conteudo/*.json`, `dados/configuracao.json`, `dados/vocabulario.json`, `assets/`). Não existe segundo banco de conteúdo.
- **Sem dependência externa**: painel próprio, estático, servido pelo Worker, em vez de um CMS de terceiros. Assim não há login do GitHub para a equipe, nem serviço fora do Cloudflare.

## O que o painel edita

| Coleção | Arquivo | Campos |
|---|---|---|
| Caminhos (20) | `conteudo/<publico>.json` → `paginas[tema]` | título, linha, por_que (2 parágrafos e 3 cards de dados com destaque opcional de até 8 caracteres), funciona (1 a 3 cards), nao_funciona (1 a 3 cards), resumo (5 linhas), revisado_em |
| Públicos (4) | `conteudo/<publico>.json` → `quem_e`, `como_chegar`; `dados/vocabulario.json` → nome, cor, retrato | texto, destaque, 3 cards de como chegar com fonte, retrato (upload) |
| Temas (5) | `conteudo/sobre.json` → `temas` | texto |
| Sobre | `conteudo/sobre.json` | projeto, como_foi_feito, publicos_intro, aviso_ia, quem_faz, receba |
| Privacidade | `conteudo/sobre.json` | privacidade (texto com seções ##), privacidade_revisada_em |
| Site | `dados/configuracao.json` | marca, navegação, home (título, texto, avisos, botão, chamada), rótulos dos blocos, textos do Explorar, compartilhar, aviso de privacidade, rodapé (assinatura, contato, receba, substack_embed), video_embed, banner (lista e intervalo) |
| Assets | `assets/` | upload de imagens (banner, retratos, logos, ícones), com nome fixo por uso e pré-visualização |

Cada campo mostra a regra na própria tela (tamanho máximo, quantidade de cards, itálico para avisos). O painel valida antes de salvar com as mesmas regras do build (estrutura, destaque de até 8 caracteres, 5 linhas de resumo, termos bloqueados). Erro aparece no campo, não como falha de deploy.

## Fluxo de edição

1. A pessoa entra em `/admin`, recebe o código por e-mail, entra.
2. Escolhe a coleção e o item. Edita num formulário; textos longos em área de texto simples (sem editor rico).
3. **Pré-visualizar**: o painel monta a página com o build do próprio site, em memória, e mostra ao lado, sem publicar.
4. **Publicar**: o Worker grava o arquivo no GitHub (commit na main, mensagem "CMS: <coleção> · <item> · <e-mail>"). O build roda e o site atualiza. O painel mostra o estado do deploy (em andamento, publicado, falhou com a mensagem do build).
5. **Histórico**: lista dos últimos commits do CMS, com autor e data, e botão "Reverter" que recria o arquivo da versão anterior num commit novo.

## Arquitetura

- `paginas/admin.html` e `scripts/admin/*.js`: painel estático, montado pelo build como as outras telas, usando os tokens da identidade.
- Worker: rotas `/api/cms/*` (ler arquivo, gravar arquivo, subir asset, listar histórico, estado do deploy). Todas exigem o cabeçalho de identidade do Access (`Cf-Access-Authenticated-User-Email`) validado pelo JWT do Access; sem ele, 401.
- Segredos no painel do Cloudflare: `GITHUB_TOKEN` (token refinado, só este repositório, permissão de conteúdo), `ACCESS_AUD` (identificador da aplicação do Access para validar o JWT).
- Sem armazenamento próprio: o estado é o repositório.

## Access

- Aplicação nova no Zero Trust: `decisivas.com.br/admin*`. Política: **Allow**, regra "Emails" com a lista da equipe. Método de login: **One-time PIN** (código por e-mail). Sessão de 24 horas.
- A aplicação atual, que protege o site inteiro no `workers.dev`, é removida no lançamento oficial (14/09). Até lá, o beta segue atrás dela com os e-mails da equipe.

## Domínios

- `decisivas.com.br`: domínio principal (Workers > decisivas > Settings > Domains & Routes > Custom domain).
- `decisivas.com` e `decisivas.org`: redirecionam com 301 para `decisivas.com.br`, mantendo o caminho (regra de redirecionamento no Cloudflare, ou rota no Worker).
- `configuracao.json` recebe `site.url = https://decisivas.com.br` para compartilhamento e imagem de prévia.

## Critérios de aceitação

1. Uma pessoa da lista entra em `/admin` só com o e-mail e o código; alguém fora da lista não passa do Access.
2. Editar a linha de resumo de um caminho e publicar: commit na main com o e-mail no autor, deploy verde, texto novo no site em menos de dois minutos.
3. Destaque com 9 caracteres: erro no campo, sem commit.
4. Texto com termo bloqueado: erro no campo nomeando a regra, sem commit.
5. Upload de um retrato: arquivo em `assets/` com o nome fixo, visível na página do público após o deploy.
6. Reverter a última edição: commit novo restaurando o arquivo anterior.
7. Chamada a `/api/cms/*` sem o JWT do Access: 401.
8. CONTEXTO, CLAUDE.md e docs/06 atualizados: painel, fluxo de publicação, segredos, Access, domínios.
