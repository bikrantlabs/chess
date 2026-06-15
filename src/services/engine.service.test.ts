import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EngineService } from "./engine.service.js";
import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

function createMockProcess() {
  const stdout = new EventEmitter() as ChildProcess["stdout"] &
    EventEmitter & { readable: boolean };
  const stdin = new EventEmitter() as ChildProcess["stdin"] &
    EventEmitter & { writable: boolean; write: ReturnType<typeof vi.fn> };
  const stderr = new EventEmitter() as ChildProcess["stderr"] &
    EventEmitter & { readable: boolean };

  stdin.write = vi.fn();

  const process = {
    stdout,
    stdin,
    stderr,
    kill: vi.fn(),
    on: vi.fn(),
  } as unknown as ChildProcess;

  (spawn as ReturnType<typeof vi.fn>).mockReturnValue(process);
  return { process, stdout, stdin };
}

describe("EngineService handshake", () => {
  let mock: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    vi.useFakeTimers();
    mock = createMockProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("sends uci then isready on init", async () => {
    const engine = new EngineService("/fake/engine");

    const initPromise = engine.init();

    mock.stdout.emit("data", Buffer.from("uciok\n"));
    mock.stdout.emit("data", Buffer.from("readyok\n"));

    await expect(initPromise).resolves.toBeUndefined();

    const writeCalls = (mock.stdin.write as ReturnType<typeof vi.fn>).mock
      .calls.map((c: string[]) => c[0]);
    expect(writeCalls[0]).toBe("uci\n");
    expect(writeCalls[1]).toBe("isready\n");
  });

  it("resolves go() with bestmove", async () => {
    const engine = new EngineService("/fake/engine");

    const initPromise = engine.init();
    mock.stdout.emit("data", Buffer.from("uciok\nreadyok\n"));
    await initPromise;

    const goPromise = engine.go(10);
    mock.stdout.emit("data", Buffer.from("bestmove e2e4\n"));

    await expect(goPromise).resolves.toBe("e2e4");
  });

  it("rejects on timeout", async () => {
    const engine = new EngineService("/fake/engine");

    const initPromise = engine.init();
    mock.stdout.emit("data", Buffer.from("uciok\nreadyok\n"));
    await initPromise;

    const goPromise = engine.go(10, 100);
    vi.advanceTimersByTime(150);

    await expect(goPromise).rejects.toThrow("timed out");
  });
});
