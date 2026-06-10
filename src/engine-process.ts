// server/engine/engineProcess.ts
import { spawn } from "child_process";

export class EngineProcess {
  private engine = spawn("./engine");

  constructor() {
    this.engine.stdout.on("data", (data) => {
      console.log("ENGINE:", data.toString());
    });

    this.send("uci");
    this.send("isready");
  }

  send(cmd: string) {
    this.engine.stdin.write(cmd + "\n");
  }

  setPosition(moves: string[]) {
    this.send("position startpos moves " + moves.join(" "));
  }

  go(depth = 10): Promise<string> {
    return new Promise((resolve) => {
      const handler = (data: Buffer) => {
        const text = data.toString();
        if (text.includes("bestmove")) {
          const move = text.split(" ")[1] as string;
          resolve(move);
        }
      };

      this.engine.stdout.on("data", handler);

      this.send(`go depth ${depth}`);
    });
  }
}
