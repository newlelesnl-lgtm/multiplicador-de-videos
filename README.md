# Multiplica

Ferramenta para criar variações de vídeos curtos combinando **ganchos**, **desenvolvimentos** e **chamadas para ação (CTAs)**. Com 3 ganchos, 2 desenvolvimentos e 2 CTAs, por exemplo, o Multiplica monta 12 vídeos diferentes em formato vertical (1080 × 1920).

O projeto tem três formas de uso:

| Versão | Situação | Onde os vídeos são processados |
| --- | --- | --- |
| Navegador (desenvolvimento) | Funcionando | No próprio computador |
| Aplicativo para Windows | Funcionando | No próprio computador |
| Aplicativo para Android (APK) | Em preparação | Num computador ou servidor com o Multiplica |

## O que já funciona

- Biblioteca dividida em Ganchos, Desenvolvimentos e CTAs.
- Envio de vários vídeos pelo seletor ou arrastando e soltando.
- Modo automático: dois ou mais vídeos completos são divididos em gancho, desenvolvimento e CTA.
- Projetos e clipes salvos no computador, com criação, troca e renomeação de projetos.
- Editor de cortes com precisão de 0,1 segundo.
- Cálculo do total de combinações e prévia de cada sequência, com duração estimada.
- Seleção individual ou em massa das combinações a produzir, com nome para cada lote.
- Texto principal com posição, cores e opacidade configuráveis, e assinatura da marca no vídeo.
- Normalização automática para vídeo vertical 1080 × 1920, montagem com FFmpeg e acompanhamento do progresso.
- Prévia, download individual e exportação em lote por ZIP.
- Histórico das últimas 20 exportações de cada projeto.
- Interface responsiva para computador e celular.

## Como rodar em desenvolvimento

Requer Node.js 22 ou mais recente.

```bash
npm install
npm run dev
```

A interface abre em `http://127.0.0.1:5173` e o servidor em `http://127.0.0.1:3001`. Em desenvolvimento, os projetos ficam em `data/` e os vídeos exportados em `outputs/videos/`.

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm run build` | Gera a interface em `dist/` |
| `npm run lint` | Verifica o código |
| `npm run start:server` | Inicia só o servidor (serve também a interface de `dist/`, se existir) |
| `npm run start:lan` | Inicia o servidor acessível pela rede Wi-Fi, para o app Android |

## Aplicativo para Windows

Inclui a interface, o servidor e o FFmpeg. Não depende de internet nem de uma instalação separada do Node.js.

```bash
npm install
npm run dist:win
```

Os arquivos são criados em `release/`:

- `Multiplica Setup 0.1.0.exe`: instalador, cria atalhos no Menu Iniciar e, se escolhido, na Área de Trabalho;
- `Multiplica 0.1.0.exe`: versão portátil, que pode ser copiada e aberta diretamente.

No aplicativo instalado, projetos e clipes ficam na pasta de dados do aplicativo do Windows, e os vídeos processados em `Vídeos/Multiplica`.

## Aplicativo para Android (APK)

### Como funciona

O app Android é a mesma interface, empacotada com [Capacitor](https://capacitorjs.com). A montagem dos vídeos com FFmpeg é pesada demais para ser feita de forma confiável no celular, então ela continua num **servidor do Multiplica**:

- **na mesma rede Wi-Fi**: um computador com o Multiplica rodando (`npm run start:lan`);
- **num servidor na internet**: planejado para uma próxima etapa, depois de adicionar uma senha de acesso (veja as pendências abaixo).

Ao abrir o app pela primeira vez, ele pede o **endereço do servidor**. Esse endereço pode ser trocado depois pelo ícone de servidor no topo da tela.

### Usar o celular com o computador na mesma rede

1. No computador, inicie o servidor liberado para a rede:

   ```bash
   npm run start:lan
   ```

2. O terminal mostra uma linha como `Na rede local (app Android): http://192.168.0.10:3001`.
3. No app, informe esse endereço e toque em **Conectar**.

Se o celular não conectar, confira se os dois aparelhos estão na mesma rede e se o firewall do computador permite conexões na porta 3001.

### Gerar o APK de testes

Requisitos: [Android Studio](https://developer.android.com/studio) (ou JDK 21 e Android SDK 36), com a variável `ANDROID_HOME` apontando para o SDK.

```bash
npm install
npm run dist:android
```

O APK é criado em `release/Multiplica-0.1.0-teste.apk`. Para instalar, copie o arquivo para o celular e permita a instalação de apps de fontes desconhecidas.

Para abrir o projeto no Android Studio (emulador, depuração, ajustes nativos):

```bash
npm run android:sync
```

```bash
npm run android:open
```

O projeto nativo fica em `android/`. Sempre que a interface mudar, rode `npm run android:sync` para copiá-la para o app.

### O que falta antes de distribuir o app

1. **Baixar e compartilhar vídeos no celular**: os links de download do navegador não funcionam dentro do app; é preciso usar os recursos nativos de arquivos e compartilhamento do Android.
2. **Senha de acesso ao servidor**: hoje qualquer aparelho na mesma rede pode usar o servidor aberto com `start:lan`. Isso precisa existir antes de colocar o servidor na internet.
3. **Acesso pelo app do Windows**: o aplicativo instalado aceita conexões só do próprio computador; falta uma opção para liberar o acesso pelo celular.
4. **Ícone e tela de abertura** do Multiplica.
5. **Assinatura de publicação** (keystore) e geração do pacote `.aab` para a Google Play.
6. **Testes em aparelhos reais**, principalmente com envios de vídeos grandes pela rede.

## Configuração do servidor

Todas as variáveis são opcionais.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3001` | Porta do servidor |
| `MULTIPLICA_HOST` | `127.0.0.1` | Endereço de escuta. `0.0.0.0` libera o acesso pela rede (o mesmo que `--lan`) |
| `MULTIPLICA_ALLOWED_ORIGINS` | — | Origens extras que podem chamar a API, separadas por vírgula |
| `MULTIPLICA_DATA_DIR` | `data/` | Projetos e clipes |
| `MULTIPLICA_WORK_DIR` | `work/render-jobs/` | Arquivos temporários de processamento |
| `MULTIPLICA_OUTPUT_DIR` | `outputs/videos/` | Vídeos exportados |
| `MULTIPLICA_FRONTEND_DIR` | `dist/` | Interface servida pelo servidor |
| `MULTIPLICA_FFMPEG` / `MULTIPLICA_FFPROBE` | FFmpeg embutido | Caminho de outro FFmpeg/FFprobe |
| `MULTIPLICA_FONT` | Arial Negrito (Windows) | Fonte dos textos sobre o vídeo |

**Servidor em Linux:** o FFmpeg embutido para Linux não tem o filtro de texto, então exportações com texto ou assinatura falham com ele. Instale o FFmpeg do sistema (`apt install ffmpeg`) e use `MULTIPLICA_FFMPEG=/usr/bin/ffmpeg`. A fonte é escolhida automaticamente entre as instaladas (DejaVu, Liberation ou FreeSans).

## Limites atuais

- Até 30 arquivos e 500 MB por arquivo em cada envio.
- Até 100 combinações por lote.

## Próximas etapas

1. Testes com vídeos reais no aplicativo Windows.
2. Concluir o app Android (pendências acima) e testar em aparelhos.
3. Legendas automáticas por transcrição e trilhas de áudio.
4. Modelos de transição entre os trechos.
5. Backup e sincronização em nuvem.
