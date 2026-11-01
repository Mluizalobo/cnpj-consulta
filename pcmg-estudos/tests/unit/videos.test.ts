import { describe, expect, it } from "vitest";
import { buildQuery, extractYoutubeId, parseIsoDuration, rankVideos, type RawVideo } from "@/lib/videos/youtube";
import { searchYoutube, youtubeOembed, YoutubeNotConfigured, YoutubeQuotaError } from "@/lib/videos/api";

const raw = (p: Partial<RawVideo>): RawVideo => ({ id: "abcdefghijk", title: "Aula de Direito Penal", channelTitle: "Canal X", channelId: "c1", thumbnail: "https://i.ytimg.com/x.jpg", publishedAt: "2026-01-10T00:00:00Z", duration: "PT45M", viewCount: "10000", liveBroadcastContent: "none", rank: 0, ...p });
const NOW = new Date("2026-11-02T12:00:00Z");

describe("videoaulas — regras", () => {
  it("extrai o ID de vários formatos de link e rejeita links inválidos", () => {
    expect(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ?si=x")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://vimeo.com/123")).toBeNull();
    expect(extractYoutubeId("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(extractYoutubeId("javascript:alert(1)")).toBeNull();
  });
  it("converte duração ISO 8601", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45M")).toBe(2700);
    expect(parseIsoDuration("P0D")).toBe(0);
    expect(parseIsoDuration("lixo")).toBeNull();
  });
  it("monta a busca a partir da matéria e do conteúdo", () => {
    expect(buildQuery({ subjectName: "Direito Penal", topic: "Teoria do crime" })).toBe("Teoria do crime Direito Penal aula concurso");
    expect(buildQuery({ subjectName: "Lei Orgânica da PCMG — LC Estadual nº 129/2013" })).toBe("Lei Orgânica da PCMG aula concurso");
  });
  it("descarta vídeos curtos, ao vivo e de outras matérias; prioriza aulas completas, recentes e da banca", () => {
    const list = rankVideos([
      raw({ id: "curto000001", title: "Direito Penal em 1 minuto", duration: "PT50S", rank: 0 }),
      raw({ id: "aovivo00001", title: "Aula de Direito Penal AO VIVO", liveBroadcastContent: "upcoming", rank: 1 }),
      raw({ id: "outra000001", title: "Aula de Informática: Excel", description: "planilhas", rank: 2 }),
      raw({ id: "boa00000001", title: "Teoria do Crime - Aula completa Direito Penal FGV concurso", duration: "PT1H10M", rank: 3 }),
      raw({ id: "antiga00001", title: "Teoria do crime Direito Penal aula", publishedAt: "2015-01-01T00:00:00Z", rank: 4 }),
    ], { subjectName: "Direito Penal", topic: "Teoria do crime", board: "FGV", otherSubjects: ["Informática"], lawSubject: true, now: NOW });
    expect(list.map((v) => v.youtubeId)).toEqual(["boa00000001", "antiga00001"]);
    expect(list[0].reasons).toEqual(expect.arrayContaining(["aula", "foco em concursos", "menciona a banca FGV", "aula completa", "recente"]));
    expect(list[1].outdated).toBe(true);
    expect(list[0].url).toBe("https://www.youtube.com/watch?v=boa00000001");
  });
});

describe("videoaulas — API (sem inventar resultados)", () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  it("sem chave configurada: erro claro, nenhum vídeo", async () => {
    await expect(searchYoutube({ subjectName: "Direito Penal" }, { key: "" })).rejects.toBeInstanceOf(YoutubeNotConfigured);
  });
  it("cota esgotada: erro claro", async () => {
    const f = (async () => ok({ error: {} }, 403)) as unknown as typeof fetch;
    await expect(searchYoutube({ subjectName: "Direito Penal" }, { key: "k", fetch: f })).rejects.toBeInstanceOf(YoutubeQuotaError);
  });
  it("usa somente vídeos devolvidos pela API, com duração e visualizações reais", async () => {
    const calls: string[] = [];
    const f = (async (u: string) => {
      calls.push(u);
      if (u.includes("/search?")) return ok({ items: [{ id: { videoId: "boa00000001" }, snippet: { title: "Teoria do crime - aula de Direito Penal para concurso", description: "", channelTitle: "Canal Real", channelId: "UC1", publishedAt: "2026-05-01T00:00:00Z", liveBroadcastContent: "none", thumbnails: { medium: { url: "https://i.ytimg.com/vi/boa00000001/mqdefault.jpg" } } } }] });
      return ok({ items: [{ id: "boa00000001", contentDetails: { duration: "PT52M" }, statistics: { viewCount: "5300" } }] });
    }) as unknown as typeof fetch;
    const r = await searchYoutube({ subjectName: "Direito Penal", topic: "Teoria do crime" }, { key: "k", fetch: f, now: NOW });
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ youtubeId: "boa00000001", channelTitle: "Canal Real", durationSeconds: 3120, viewCount: 5300 });
    expect(calls[0]).toContain("relevanceLanguage=pt");
    expect(calls[0]).toContain("videoEmbeddable=true");
  });
  it("API sem resultados devolve lista vazia (não preenche com nada)", async () => {
    const f = (async () => ok({ items: [] })) as unknown as typeof fetch;
    expect((await searchYoutube({ subjectName: "Criminologia" }, { key: "k", fetch: f })).results).toEqual([]);
  });
  it("oEmbed: lê título/canal reais e rejeita vídeo inexistente", async () => {
    const f = (async (u: string) => (u.includes("dQw4w9WgXcQ") ? ok({ title: "Aula X", author_name: "Prof. Canal" }) : ok({}, 404))) as unknown as typeof fetch;
    expect(await youtubeOembed("https://youtu.be/dQw4w9WgXcQ", f)).toMatchObject({ title: "Aula X", channelTitle: "Prof. Canal", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await expect(youtubeOembed("https://youtu.be/AAAAAAAAAAA", f)).rejects.toThrow(/não encontrado/);
    await expect(youtubeOembed("https://exemplo.com/video", f)).rejects.toThrow(/inválido/);
  });
});
