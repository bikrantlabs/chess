import { spawn, ChildProcess } from "child_process";
import { existsSync, accessSync, chmodSync, constants } from "fs";
import { platform } from "os";

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

  constructor(private enginePath: string) {
    console.log(`[EngineService] Constructor called with path: ${enginePath}`);

    console.log(`[EngineService] Checking if file exists: ${existsSync(enginePath)}`);
    if (platform() !== "win32") {
      try {
        accessSync(enginePath, constants.X_OK);
        console.log(`[EngineService] File is executable`);
      } catch {
        console.log(`[EngineService] File not executable, setting +x permission`);
        try {
          chmodSync(enginePath, 0o755);
          console.log(`[EngineService] Permission set successfully`);
        } catch (err) {
          console.error(`[EngineService] Failed to set permission:`, err);
        }
      }
    } else {
      console.log(`[EngineService] Windows: skipping permission check`);
    }

    this.ready = new Promise<void>((resolve, reject) => {
      console.log(`[EngineService] Spawning process: ${enginePath}`);
      try {
        this.process = spawn(this.enginePath, [], {
          stdio: ["pipe", "pipe", "pipe"],
        });
        console.log(`[EngineService] Spawn successful, pid: ${this.process.pid}`);
      } catch (err) {
        console.error(`[EngineService] Spawn FAILED:`, err);
        reject(err);
        return;
      }

      this.process.stderr?.on("data", (data: Buffer) => {
        console.log("[EngineService stderr]:", data.toString());
      });

      let handshake = 0;

      this.process.stdout?.on("data", (data: Buffer) => {
        const raw = data.toString();
        console.log("[EngineService stdout raw]:", JSON.stringify(raw));
        this.buffer += raw;
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            console.log(`[EngineService stdout line]: "${trimmed}"`);
          }

          if (this.messageCallback) this.messageCallback(trimmed);

          if (trimmed === "uciok") {
            console.log(`[EngineService] Received uciok (handshake bit 1 set)`);
            handshake |= 1;
          }
          if (trimmed === "readyok") {
            console.log(`[EngineService] Received readyok (handshake bit 2 set)`);
            handshake |= 2;
          }

          if (handshake === 3) {
            console.log(`[EngineService] Handshake complete, resolving ready promise`);
            resolve();
          }

          if (this.busy && this.queue.length > 0) {
            const item = this.queue[0] as QueueItem;
            if (trimmed === item.marker || trimmed.startsWith(item.marker)) {
              console.log(`[EngineService] Command match for "${item.command}": "${trimmed}"`);
              this.busy = false;
              if (item.timeout) clearTimeout(item.timeout);
              this.queue.shift();
              item.resolve(trimmed);
              this.processQueue();
            }
          }
        }
      });

      this.process.on("error", (err) => {
        console.error(`[EngineService] Process error event:`, err);
        reject(err);
      });

      this.process.on("exit", (code, signal) => {
        console.log(`[EngineService] Process exited with code=${code}, signal=${signal}`);
        if (handshake !== 3) {
          reject(new Error(`Engine exited before handshake complete (code=${code}, signal=${signal})`));
        }
        this.rejectAll(new Error(`Engine exited with code ${code}`));
      });

      console.log(`[EngineService] Sending: uci`);
      this.sendRaw("uci");
      console.log(`[EngineService] Sending: isready`);
      this.sendRaw("isready");
    });
  }

  async init(): Promise<void> {
    console.log(`[EngineService] init() called, awaiting ready promise...`);
    try {
      await this.ready;
      console.log(`[EngineService] init() complete, engine ready`);
    } catch (err) {
      console.error(`[EngineService] init() failed:`, err);
      throw err;
    }
  }

  setPosition(fen: string, moves: string[] = []) {
    const cmd = moves.length
      ? `position fen ${fen} moves ${moves.join(" ")}`
      : `position fen ${fen}`;
    console.log(`[EngineService] setPosition: ${cmd}`);
    this.sendRaw(cmd);
  }

  go(depth: number, timeoutMs = 30000): Promise<string> {
    console.log(`[EngineService] go(depth=${depth}, timeoutMs=${timeoutMs})`);
    return this.enqueue(`go depth ${depth}`, "bestmove", timeoutMs).then(
      (line) => {
        const move = line.split(" ")[1] ?? "";
        console.log(`[EngineService] go result: "${line}" -> move: "${move}"`);
        return move;
      },
    );
  }

  goTime(ms: number, timeoutMs = 60000): Promise<string> {
    console.log(`[EngineService] goTime(ms=${ms}, timeoutMs=${timeoutMs})`);
    return this.enqueue(`go movetime ${ms}`, "bestmove", timeoutMs).then(
      (line) => {
        const move = line.split(" ")[1] ?? "";
        console.log(`[EngineService] goTime result: "${line}" -> move: "${move}"`);
        return move;
      },
    );
  }

  async eval(timeoutMs = 5000): Promise<number> {
    console.log(`[EngineService] eval(timeoutMs=${timeoutMs})`);
    const line = await this.enqueue("eval", "Total evaluation", timeoutMs);
    const match = line.match(
      /(?:Total evaluation|Final evaluation):?\s*(-?\d+\.?\d*)/,
    );
    const result = match ? parseFloat(match[1] as string) : 0;
    console.log(`[EngineService] eval result: "${line}" -> ${result}`);
    return result;
  }

  async stop(): Promise<void> {
    console.log(`[EngineService] stop()`);
    this.sendRaw("stop");
  }

  async quit(): Promise<void> {
    console.log(`[EngineService] quit()`);
    this.sendRaw("quit");
    this.process?.kill();
    this.process = null;
    this.rejectAll(new Error("Engine quit"));
  }

  onMessage(cb: (line: string) => void) {
    this.messageCallback = cb;
  }

  private sendRaw(cmd: string) {
    const msg = cmd + "\n";
    console.log(`[EngineService] sendRaw: ${JSON.stringify(cmd)}`);
    this.process?.stdin?.write(msg);
  }

  private enqueue(
    command: string,
    marker: string,
    timeoutMs?: number,
  ): Promise<string> {
    console.log(`[EngineService] enqueue(command=${JSON.stringify(command)}, marker=${JSON.stringify(marker)}, timeoutMs=${timeoutMs})`);
    return new Promise<string>((resolve, reject) => {
      const item: QueueItem = { command, resolve, reject, marker };
      if (timeoutMs) {
        item.timeout = setTimeout(() => {
          const idx = this.queue.indexOf(item);
          if (idx >= 0) {
            this.queue.splice(idx, 1);
          }
          this.busy = false;
          if (command.startsWith("go ")) {
            console.log(`[EngineService] Timed out, sending stop`);
            this.sendRaw("stop");
          }
          console.error(`[EngineService] Command timed out: ${command}`);
          reject(new Error(`Engine command timed out: ${command}`));
        }, timeoutMs);
      }
      this.queue.push(item);
      this.processQueue();
    });
  }

  private processQueue() {
    console.log(`[EngineService] processQueue: busy=${this.busy}, queue.length=${this.queue.length}`);
    if (this.busy || this.queue.length === 0) return;
    if (!this.process) {
      console.error(`[EngineService] processQueue: engine not running`);
      this.queue.shift()?.reject(new Error("Engine not running"));
      return;
    }
    this.busy = true;
    const item = this.queue[0] as QueueItem;
    console.log(`[EngineService] processQueue: sending next command: ${JSON.stringify(item.command)}`);
    this.sendRaw(item.command);
  }

  private rejectAll(err: Error) {
    console.log(`[EngineService] rejectAll: rejecting ${this.queue.length} queued items`);
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        if (item.timeout) clearTimeout(item.timeout);
        item.reject(err);
      }
    }
  }
}
