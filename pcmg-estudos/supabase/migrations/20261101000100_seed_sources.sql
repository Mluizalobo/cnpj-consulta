-- Fontes monitoradas pela Central do Concurso (podem ser editadas aqui).
insert into public.competition_sources (name, url, kind) values
  ('Polícia Civil de Minas Gerais — Concursos', 'https://www.policiacivil.mg.gov.br/pagina/concursos', 'oficial'),
  ('Polícia Civil de Minas Gerais — Notícias', 'https://www.policiacivil.mg.gov.br/noticias', 'oficial'),
  ('Portal MG — Concursos', 'https://www.mg.gov.br/servico/consultar-concursos-publicos', 'oficial'),
  ('SEPLAG-MG — Concursos', 'https://www.planejamento.mg.gov.br/', 'oficial'),
  ('ACADEPOL-MG', 'https://www.policiacivil.mg.gov.br/pagina/acadepol', 'oficial'),
  ('Diário Oficial de MG (Jornal Minas Gerais)', 'https://www.jornalminasgerais.mg.gov.br/', 'diario_oficial'),
  ('FGV Conhecimento — Concursos', 'https://conhecimento.fgv.br/concursos', 'banca'),
  ('PCI Concursos — PCMG (secundária)', 'https://www.pciconcursos.com.br/concurso/policia-civil-mg', 'secundaria'),
  ('Estratégia Concursos — PCMG (secundária)', 'https://www.estrategiaconcursos.com.br/blog/concurso-pc-mg/', 'secundaria'),
  ('Gran Cursos — PCMG (secundária)', 'https://blog.grancursosonline.com.br/concurso-pc-mg/', 'secundaria'),
  ('Direção Concursos — PCMG (secundária)', 'https://www.direcaoconcursos.com.br/artigos/concurso-pc-mg', 'secundaria')
on conflict (url) do nothing;
