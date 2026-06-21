import { spawn, ChildProcess } from "child_process";

interface QueueItem {
  command: string;
  resolve: (value: string) => void;
  reject: (err: Error) => void;
  marker: string;
  timeout?: NodeJS.Timeout;
}

export class EngineService {
  private process: ChildProcess | null = null;
  private buffer = "";
  private queue: QueueItem[] = [];
  private busy = false;
  private messageCallback: ((line: string) => void) | null = null;
  private ready: Promise<void>;

  constructor(private enginePath: string = "../engine/endgame.exe") {
    this.ready = new Promise<void>((resolve, reject) => {
      this.process = spawn(this.enginePath, [], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let handshake = 0;
      this.process.stdout!.on("data", (data: Buffer) => {
        this.buffer += data.toString();
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (this.messageCallback) this.messageCallback(trimmed);

          if (trimmed === "uciok") handshake |= 1;
          if (trimmed === "readyok") handshake |= 2;
          if (handshake === 3) resolve();

          if (this.busy && this.queue.length > 0) {
            const item = this.queue[0] as QueueItem;
            if (trimmed === item.marker || trimmed.startsWith(item.marker)) {
              this.busy = false;
              if (item.timeout) clearTimeout(item.timeout);
              this.queue.shift();
              item.resolve(trimmed);
              this.processQueue();
            }
          }
        }
      });

      this.process.on("error", reject);
      this.process.on("exit", (code) => {
        this.rejectAll(new Error(`Engine exited with code ${code}`));
      });

      this.sendRaw("uci");
      this.sendRaw("isready");
    });
  }

  async init(): Promise<void> {
    return this.ready;
  }

  setPosition(fen: string, moves: string[] = []) {
    const cmd = moves.length
      ? `position fen ${fen} moves ${moves.join(" ")}`
      : `position fen ${fen}`;
    this.sendRaw(cmd);
  }

  go(depth: number, timeoutMs = 30000): Promise<string> {
    return this.enqueue(`go depth ${depth}`, "bestmove", timeoutMs).then(
      (line) => line.split(" ")[1] ?? "",
    );
  }

  goTime(ms: number, timeoutMs = 60000): Promise<string> {
    return this.enqueue(`go movetime ${ms}`, "bestmove", timeoutMs).then(
      (line) => line.split(" ")[1] ?? "",
    );
  }

  async eval(timeoutMs = 5000): Promise<number> {
    const line = await this.enqueue("eval", "Total evaluation", timeoutMs);
    const match = line.match(
      /(?:Total evaluation|Final evaluation):?\s*(-?\d+\.?\d*)/,
    );
    return match ? parseFloat(match[1] as string) : 0;
  }

  async stop(): Promise<void> {
    this.sendRaw("stop");
  }

  async quit(): Promise<void> {
    this.sendRaw("quit");
    this.process?.kill();
    this.process = null;
    this.rejectAll(new Error("Engine quit"));
  }

  onMessage(cb: (line: string) => void) {
    this.messageCallback = cb;
  }

  private sendRaw(cmd: string) {
    this.process?.stdin?.write(cmd + "\n");
  }

  private enqueue(
    command: string,
    marker: string,
    timeoutMs?: number,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const item: QueueItem = { command, resolve, reject, marker };
      if (timeoutMs) {
        item.timeout = setTimeout(() => {
          const idx = this.queue.indexOf(item);
          if (idx >= 0) {
            this.queue.splice(idx, 1);
          }
          this.busy = false;
          reject(new Error(`Engine command timed out: ${command}`));
        }, timeoutMs);
      }
      this.queue.push(item);
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.busy || this.queue.length === 0) return;
    if (!this.process) {
      this.queue.shift()?.reject(new Error("Engine not running"));
      return;
    }
    this.busy = true;
    const item = this.queue[0] as QueueItem;
    this.sendRaw(item.command);
  }

  private rejectAll(err: Error) {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        if (item.timeout) clearTimeout(item.timeout);
        item.reject(err);
      }
    }
  }
}
