import { EngineService } from "./engine.service.js";

export class EnginePool {
  private available: EngineService[] = [];
  private active = new Set<EngineService>();
  private readonly maxSize: number;

  constructor(
    private enginePath: string = "./engine/stockfish",
    maxSize = 4,
  ) {
    this.maxSize = maxSize;
  }

  async acquire(): Promise<EngineService> {
    if (this.available.length > 0) {
      const engine = this.available.pop()!;
      this.active.add(engine);
      return engine;
    }

    if (this.active.size < this.maxSize) {
      const engine = new EngineService(this.enginePath);
      await engine.init();
      this.active.add(engine);
      return engine;
    }

    return new Promise((resolve) => {
      const check = () => {
        if (this.available.length > 0) {
          const engine = this.available.pop()!;
          this.active.add(engine);
          resolve(engine);
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  release(engine: EngineService): void {
    this.active.delete(engine);
    this.available.push(engine);
  }

  async destroy(): Promise<void> {
    for (const engine of this.available) {
      await engine.quit();
    }
    for (const engine of this.active) {
      await engine.quit();
    }
    this.available = [];
    this.active.clear();
  }

  get activeCount() {
    return this.active.size;
  }

  get availableCount() {
    return this.available.length;
  }

  get totalCount() {
    return this.active.size + this.available.length;
  }
}
