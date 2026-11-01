/**
 * Estrutura PRELIMINAR do edital verticalizado, com temas usuais de cada matéria.
 * NÃO é o conteúdo programático oficial: serve para começar os estudos antes do edital.
 * Quando o edital for publicado, a Central do Concurso substitui esta estrutura.
 */
export const PRELIM_SYLLABUS: Record<string, [string, string[]][]> = {
  portugues: [
    ["Compreensão e interpretação de textos", ["Tipologia e gêneros textuais", "Coesão e coerência", "Inferência e pressupostos"]],
    ["Ortografia e acentuação", ["Emprego de letras", "Acentuação gráfica (Acordo Ortográfico)", "Hífen"]],
    ["Morfologia", ["Classes de palavras", "Emprego de pronomes", "Tempos e modos verbais", "Vozes verbais"]],
    ["Sintaxe", ["Termos da oração", "Coordenação e subordinação", "Concordância verbal e nominal", "Regência verbal e nominal", "Crase", "Colocação pronominal"]],
    ["Pontuação", ["Emprego da vírgula", "Demais sinais de pontuação"]],
    ["Semântica", ["Sinonímia e antonímia", "Polissemia e ambiguidade", "Relações estabelecidas por conectivos"]],
  ],
  informatica: [
    ["Sistemas operacionais", ["Windows: conceitos e atalhos", "Gerenciamento de arquivos e pastas"]],
    ["Aplicativos de escritório", ["Editores de texto", "Planilhas eletrônicas: fórmulas e funções", "Apresentações"]],
    ["Redes e internet", ["Conceitos de redes", "Navegadores e protocolos", "Correio eletrônico", "Computação em nuvem"]],
    ["Segurança da informação", ["Malwares", "Engenharia social e phishing", "Firewall e antivírus", "Backup", "Criptografia e certificação digital"]],
  ],
  "dir-administrativo": [
    ["Princípios da Administração Pública", ["Princípios expressos (LIMPE)", "Princípios implícitos"]],
    ["Organização administrativa", ["Administração direta e indireta", "Desconcentração e descentralização"]],
    ["Poderes administrativos", ["Poder de polícia", "Poder hierárquico e disciplinar", "Abuso de poder"]],
    ["Atos administrativos", ["Requisitos e atributos", "Classificação", "Anulação, revogação e convalidação"]],
    ["Agentes públicos", ["Cargos, empregos e funções", "Regime disciplinar"]],
    ["Responsabilidade civil do Estado", ["Teoria do risco administrativo", "Ação regressiva"]],
    ["Improbidade administrativa", ["Lei 8.429/1992 e alterações da Lei 14.230/2021"]],
    ["Licitações e contratos", ["Lei 14.133/2021: noções gerais"]],
  ],
  "dir-constitucional": [
    ["Teoria da Constituição", ["Conceito e classificação", "Poder constituinte"]],
    ["Direitos e garantias fundamentais", ["Direitos individuais e coletivos (art. 5º)", "Remédios constitucionais", "Direitos sociais", "Nacionalidade e direitos políticos"]],
    ["Organização do Estado", ["Entes federativos e competências", "Administração Pública (arts. 37 a 41)"]],
    ["Organização dos Poderes", ["Poder Legislativo", "Poder Executivo", "Poder Judiciário", "Funções essenciais à Justiça"]],
    ["Segurança pública", ["Art. 144 da Constituição"]],
  ],
  "raciocinio-logico": [
    ["Lógica proposicional", ["Conectivos e tabela-verdade", "Equivalências lógicas", "Negação de proposições", "Argumentação"]],
    ["Lógica de primeira ordem", ["Quantificadores e diagramas"]],
    ["Matemática básica", ["Porcentagem", "Razão e proporção", "Regra de três"]],
    ["Análise combinatória e probabilidade", ["Princípio fundamental da contagem", "Probabilidade"]],
    ["Sequências", ["Sequências lógicas e numéricas"]],
  ],
  "lei-organica": [
    ["Disposições gerais da LC 129/2013", ["Natureza, princípios e competências da PCMG"]],
    ["Estrutura orgânica", ["Órgãos e unidades da PCMG"]],
    ["Carreiras policiais civis", ["Cargos, ingresso e desenvolvimento na carreira"]],
    ["Direitos, deveres e prerrogativas", ["Direitos e vantagens", "Deveres e proibições"]],
    ["Regime disciplinar", ["Infrações e penalidades", "Processo administrativo disciplinar"]],
  ],
  "dir-penal": [
    ["Aplicação da lei penal", ["Princípio da legalidade", "Lei penal no tempo e no espaço"]],
    ["Teoria do crime", ["Fato típico", "Ilicitude e excludentes", "Culpabilidade e imputabilidade", "Tentativa, desistência e arrependimento", "Concurso de pessoas"]],
    ["Penas", ["Espécies de pena", "Extinção da punibilidade"]],
    ["Crimes em espécie", ["Crimes contra a pessoa", "Crimes contra o patrimônio", "Crimes contra a dignidade sexual", "Crimes contra a Administração Pública"]],
  ],
  "processo-penal": [
    ["Inquérito policial", ["Características", "Instauração e prazos", "Arquivamento", "Indiciamento"]],
    ["Ação penal", ["Espécies de ação penal"]],
    ["Provas", ["Teoria geral da prova", "Exame de corpo de delito e cadeia de custódia", "Busca e apreensão", "Interrogatório e testemunhas"]],
    ["Prisões e medidas cautelares", ["Prisão em flagrante", "Prisão preventiva e temporária", "Audiência de custódia", "Medidas cautelares diversas"]],
    ["Juiz das garantias e Pacote Anticrime", ["Alterações da Lei 13.964/2019"]],
  ],
  "medicina-legal": [
    ["Perícia e documentos médico-legais", ["Laudo, parecer e atestado"]],
    ["Traumatologia forense", ["Instrumentos e lesões", "Lesões por arma de fogo", "Lesões corporais (classificação penal)"]],
    ["Tanatologia", ["Fenômenos cadavéricos", "Cronotanatognose"]],
    ["Asfixiologia", ["Enforcamento, estrangulamento e esganadura", "Afogamento e sufocação"]],
    ["Sexologia forense", ["Crimes sexuais: aspectos periciais"]],
    ["Identidade e identificação", ["Métodos de identificação"]],
  ],
  criminologia: [
    ["Conceito, objeto e método", ["Delito, delinquente, vítima e controle social", "Método empírico e interdisciplinar"]],
    ["Escolas e teorias", ["Escola Clássica e Positiva", "Teorias sociológicas do crime", "Labelling approach e criminologia crítica"]],
    ["Vitimologia", ["Vitimização primária, secundária e terciária"]],
    ["Prevenção do delito", ["Prevenção primária, secundária e terciária"]],
  ],
  "legislacao-extravagante": [
    ["Crimes hediondos", ["Lei 8.072/1990"]],
    ["Drogas", ["Lei 11.343/2006"]],
    ["Violência doméstica", ["Lei 11.340/2006"]],
    ["Armas de fogo", ["Lei 10.826/2003"]],
    ["Abuso de autoridade", ["Lei 13.869/2019"]],
    ["Organizações criminosas", ["Lei 12.850/2013"]],
    ["Tortura", ["Lei 9.455/1997"]],
  ],
  "direitos-humanos": [
    ["Teoria geral", ["Conceito, características e gerações"]],
    ["Sistema global", ["Declaração Universal de 1948", "Pactos internacionais de 1966"]],
    ["Sistema interamericano", ["Convenção Americana (Pacto de San José)", "Comissão e Corte Interamericana"]],
    ["Direitos humanos na Constituição", ["Incorporação de tratados (art. 5º, §§ 2º e 3º)"]],
  ],
};
