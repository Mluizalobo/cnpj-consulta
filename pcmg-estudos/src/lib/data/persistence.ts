/** Armazenamento local (cache + fila offline). No navegador usa IndexedDB. */
export interface Persistence {
  load<T>(key: string): Promise<T | undefined>;
  save(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryPersistence implements Persistence {
  map = new Map<string, string>();
  async load<T>(key: string) { const v = this.map.get(key); return v ? (JSON.parse(v) as T) : undefined; }
  async save(key: string, value: unknown) { this.map.set(key, JSON.stringify(value)); }
  async remove(key: string) { this.map.delete(key); }
}

export async function browserPersistence(): Promise<Persistence> {
  try {
    const idb = await import("idb-keyval");
    // teste rápido: alguns navegadores (modo privado) bloqueiam IndexedDB
    await idb.set("pcmg:probe", 1);
    return {
      load: (k) => idb.get(k),
      save: (k, v) => idb.set(k, v),
      remove: (k) => idb.del(k),
    };
  } catch {
    return new MemoryPersistence();
  }
}
