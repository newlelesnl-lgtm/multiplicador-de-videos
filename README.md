# Multiplica

MVP de uma ferramenta independente para criar variações de vídeos curtos combinando ganchos, desenvolvimentos e chamadas para ação.

## Como iniciar

```bash
npm install
npm run dev
```

## Aplicativo para Windows

O aplicativo para Windows inclui a interface, o servidor local e o FFmpeg. Ele não depende de uma API externa nem de uma instalação separada do Node.js.

Para gerar o instalador e a versão portátil:

```bash
npm install
npm run dist:win
```

Os arquivos são criados em `release/`. No aplicativo instalado:

- projetos e clipes ficam na pasta de dados do aplicativo do Windows;
- vídeos processados ficam em `Vídeos/Multiplica`;
- o instalador cria atalhos no Menu Iniciar e, se escolhido, na Área de Trabalho.

Use `Multiplica Setup 0.1.0.exe` para instalar no notebook. `Multiplica 0.1.0.exe` é a opção portátil, que pode ser copiada e aberta diretamente.

## Caminho para Android

A interface já é responsiva, mas o APK precisa de uma camada móvel própria. A etapa prevista é empacotar a interface com Capacitor e mover o processamento pesado de FFmpeg para uma API ou para um serviço compatível com Android. Isso evita travamentos e diferenças de codec entre celulares. O formato dos projetos e a lógica de combinações atuais podem ser reaproveitados.

Etapas planejadas:

1. validar o fluxo completo no Windows com vídeos reais;
2. definir armazenamento local e compartilhamento no Android;
3. adicionar a camada Capacitor;
4. adaptar o processamento e gerar um APK de testes;
5. testar em aparelhos antes da distribuição.

## O que já funciona

- Biblioteca dividida em Ganchos, Desenvolvimentos e CTAs.
- Upload de múltiplos vídeos pelo seletor ou por arrastar e soltar.
- Upload inteligente de dois ou mais vídeos completos, com divisão automática em gancho, desenvolvimento e CTA.
- Projetos e clipes originais persistidos no próprio computador.
- Criação e troca entre diferentes projetos.
- Telas dedicadas para gerenciar projetos e consultar exportações.
- Editor para definir início e fim de cada trecho com precisão de 0,1 segundo.
- Cálculo automático do total de combinações.
- Prévia da sequência de cada combinação, com duração estimada.
- Seleção individual ou em massa das combinações que serão produzidas.
- Nome personalizado para cada lote de exportação.
- Texto principal configurável com posição, cor do texto, cor do fundo e opacidade.
- Assinatura da marca aplicada diretamente aos vídeos exportados.
- Edição do nome do projeto.
- Normalização automática para vídeo vertical 1080 × 1920.
- Montagem real das combinações com FFmpeg local.
- Acompanhamento do progresso do processamento.
- Prévia, download individual e exportação em lote por ZIP.
- Histórico das últimas 20 exportações de cada projeto.
- Interface responsiva para computador e celular.

## Próximas etapas

1. Testes com vídeos reais no aplicativo Windows.
2. Legendas automáticas por transcrição e trilhas de áudio.
3. Modelos de transição entre os trechos.
4. Aplicativo Android.
5. Backup e sincronização em nuvem.

## Limites atuais

- Até 30 arquivos e 500 MB por arquivo em cada envio.
- Até 100 combinações por lote.
- No modo de desenvolvimento, os vídeos exportados são salvos em `outputs/videos` e os projetos em `data`.
