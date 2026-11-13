---
title: "digitalizacao-fichas-ferramenta"
description: "Ferramenta separada (fora do repo shosp) que renomeia fichas escaneadas para NOME_CPF.pdf via Google Cloud Vision; local, decisões não especificadas e pendências"
date: 2026-09-23
tags: [memoria, project]
aliases: ["digitalizacao-fichas-ferramenta"]
---

# digitalizacao-fichas-ferramenta

> Ferramenta separada (fora do repo shosp) que renomeia fichas escaneadas para NOME_CPF.pdf via Google Cloud Vision; local, decisões não especificadas e pendências

Projeto PRÓPRIO chamado **ARQUIVO MORTO**, em `G:\Meu Drive\IAs\ARQUIVO MORTO\` (repo git desde 2026-09-23, identidade local fuadi/fuadi@home; chave, fichas e .exe no .gitignore). O PROGRAMA continua se chamando "Digitalização de Fichas" (exe, janela, LEIA-MEs). Tem CLAUDE.md próprio com arquitetura, contrato e pendências — LEIA-O antes de mexer. NÃO fica dentro do shosp-extension. A spec foi o LEIA-ME que o usuário colou; o script não existia. Pacote: digitalizar_fichas.py, requirements.txt, LEIA-ME.txt + teste_digitalizar.py (15 testes offline, respostas do Vision simuladas).

- Vision REST com API key no header `X-Goog-Api-Key` (DOCUMENT_TEXT_DETECTION). Nome/CPF achados pela POSIÇÃO ao lado/abaixo dos rótulos, na direção da escrita (funciona com foto girada).
- Decisões minhas que o LEIA-ME não pedia: `CPF=SEM` → `NOME_SEMCPF.pdf`; P/S no prompt; CPF inválido bloqueia o ENTER; originais vão para `fichas_entrada\_processadas`; `registro_digitalizacao.csv` fica FORA de fichas_saida; colisão vira `_2`.

- Distribuição: `Digitalizar Fichas.exe` (PyInstaller --onefile, ~52 MB, gerado pelo `build_exe.bat`, que monta no TEMP do C: porque o PyInstaller falha misturando discos). Só o .exe (`sys.frozen`) pergunta a chave numa janelinha na 1ª vez.
- CHAVE (RESOLVIDO 2026-09-22): a chave `AQ.` (Vertex/conta de serviço) NÃO serve — Vision responde 401 "API keys are not supported by this API". Chave em uso: "Google Vision Key", criada no projeto **`oft-case`** (há TRÊS projetos "OFT CASE"; `oft-case-e0539` está SEM faturamento e foi onde tudo falhou). A cota grátis de 1.000/mês exige projeto com faturamento vinculado.
- A janela (`interface_fichas.py`, tkinter) é a cara padrão e o `.exe` é `--windowed`. O motor trabalha por FOLHA: `listar_paginas` → `preparar_pagina` → `agrupar_paginas` (folha com nome/CPF começa ficha; sem identificação é continuação) → `salvar_documento` / `pular_documento` / `juntar_documento`. Um PDF de N páginas vira N folhas e pode conter vários pacientes.
- Scanner: `scanner_wia.py` (WIA + pywin32, embutido no .exe). `listar()` NÃO conecta nos aparelhos — conectar num scanner desligado trava ~55 s e pendurava a janela; quem conecta é `capacidades()`, numa thread. Testado de verdade numa L4260 (mesa, A4 150 dpi, 10 s).
- A impressora do consultório é **WF-C5790** (com C), em 192.168.31.17, com alimentador e frente e verso até 600 dpi. RESOLVIDO 2026-09-23: além da WIA, existe `scanner_escl.py`, que fala eSCL direto com o IP e dispensa driver — testado digitalizando de verdade. Truque de diagnóstico: `https://IP/eSCL/ScannerCapabilities` no navegador; se vier XML, o caminho de rede funciona.
- 1ª leitura real (3 fichas): CPFs 3/3 certos; nomes 2/3 — numa inseriu uma palavra inexistente ("DI") e o usuário aceitou sem ver. Os nomes de arquivo do scanner do usuário NÃO são confiáveis (um trazia outro paciente), por isso a janela mostra "Arquivo do scanner" ao lado do nome lido.

**Why:** o usuário disse que os arquivos "vão ser copiados para o CR" — o que é o CR ficou sem resposta; pode impor outro padrão de nome.
**How to apply:** a leitura real de letra manuscrita segue NÃO verificada (falta chave válida); preparo da imagem, HTTPS dentro do .exe e mensagens de erro estão testados. Se relatarem erro de leitura, começar por `extrair_dados` e pedir exemplo anonimizado (nunca texto clínico). Confirmar o que é o "CR" antes de mudar o padrão do nome do arquivo.

---

Related: [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md)

Up: [Memórias](INDEX.md)
