import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import lifecycleModule from "../electron/window-close-lifecycle.cjs";

const { createWindowCloseLifecycle } = lifecycleModule as {
  createWindowCloseLifecycle: (options: {
    createRequestId: () => string;
    onFlushFailure: (target: FakeWindow, message: string) => void;
    flushTimeoutMs?: number;
    sessionEndResetMs?: number;
  }) => {
    attach: (target: FakeWindow) => void;
    handleFlushResult: (sender: FakeWebContents, result: { requestId: string; success: boolean; error?: string }) => boolean;
  };
};

class FakeWebContents {
  readonly sent: Array<{ channel: string; requestId: string }> = [];
  destroyed = false;

  isDestroyed() { return this.destroyed; }
  send(channel: string, requestId: string) { this.sent.push({ channel, requestId }); }
}

class FakeWindow extends EventEmitter {
  readonly webContents = new FakeWebContents();
  destroyed = false;
  closeCalls = 0;

  isDestroyed() { return this.destroyed; }

  close() {
    this.closeCalls += 1;
    const event = closeEvent();
    this.emit("close", event);
    if (event.prevented) return;
    this.destroyed = true;
    this.webContents.destroyed = true;
    this.emit("closed");
  }
}

function closeEvent() {
  return {
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
}

test("interactive close waits for the renderer flush before closing", () => {
  const failures: string[] = [];
  const lifecycle = createWindowCloseLifecycle({
    createRequestId: () => "interactive-close",
    onFlushFailure: (_target, message) => failures.push(message),
  });
  const window = new FakeWindow();
  lifecycle.attach(window);

  const event = closeEvent();
  window.emit("close", event);
  assert.equal(event.prevented, true);
  assert.deepEqual(window.webContents.sent, [{ channel: "app:flush-before-close", requestId: "interactive-close" }]);

  assert.equal(lifecycle.handleFlushResult(window.webContents, { requestId: "interactive-close", success: true }), true);
  assert.equal(window.closeCalls, 1);
  assert.equal(window.destroyed, true);
  assert.deepEqual(failures, []);
});

test("Windows session end requests a best-effort flush without blocking shutdown", () => {
  const lifecycle = createWindowCloseLifecycle({
    createRequestId: () => "system-session-end",
    onFlushFailure: () => assert.fail("system shutdown must not show an interactive flush failure"),
    sessionEndResetMs: 10,
  });
  const window = new FakeWindow();
  lifecycle.attach(window);

  const queryEvent = closeEvent();
  window.emit("query-session-end", queryEvent);
  assert.equal(queryEvent.prevented, false);
  assert.deepEqual(window.webContents.sent, [{ channel: "app:flush-before-close", requestId: "system-session-end" }]);

  const closeDuringShutdown = closeEvent();
  window.emit("close", closeDuringShutdown);
  assert.equal(closeDuringShutdown.prevented, false);
});

test("Windows session end cancels an interactive-close timeout already in progress", () => {
  let requestCount = 0;
  const lifecycle = createWindowCloseLifecycle({
    createRequestId: () => `request-${++requestCount}`,
    onFlushFailure: () => assert.fail("cancelled close timeout must not surface during shutdown"),
    flushTimeoutMs: 10,
    sessionEndResetMs: 10,
  });
  const window = new FakeWindow();
  lifecycle.attach(window);

  const interactiveEvent = closeEvent();
  window.emit("close", interactiveEvent);
  assert.equal(interactiveEvent.prevented, true);

  const queryEvent = closeEvent();
  window.emit("query-session-end", queryEvent);
  assert.equal(queryEvent.prevented, false);
  assert.equal(window.webContents.sent.length, 1);
  assert.equal(lifecycle.handleFlushResult(window.webContents, { requestId: "request-1", success: true }), false);
});
