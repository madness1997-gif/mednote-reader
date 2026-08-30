function createWindowCloseLifecycle({
  createRequestId,
  onFlushFailure,
  flushTimeoutMs = 15_000,
  sessionEndResetMs = 30_000,
}) {
  let pendingClose = null;
  const closeApproved = new WeakSet();
  const sessionEnding = new WeakSet();
  const sessionResetTimers = new WeakMap();

  function clearPendingClose(target) {
    if (pendingClose?.target !== target) return false;
    clearTimeout(pendingClose.timeout);
    pendingClose = null;
    return true;
  }

  function clearSessionReset(target) {
    const timer = sessionResetTimers.get(target);
    if (timer) clearTimeout(timer);
    sessionResetTimers.delete(target);
  }

  function beginSystemSessionEnd(target) {
    if (sessionEnding.has(target)) return;
    sessionEnding.add(target);

    // Windows shutdown/restart/log-off must not wait for the interactive-close
    // timeout. Reuse an in-flight flush when there is one; otherwise ask the
    // renderer for one best-effort flush without delaying the OS session end.
    const alreadyFlushing = clearPendingClose(target);
    if (!alreadyFlushing && !target.isDestroyed() && !target.webContents.isDestroyed()) {
      target.webContents.send("app:flush-before-close", createRequestId());
    }

    clearSessionReset(target);
    const timer = setTimeout(() => {
      sessionResetTimers.delete(target);
      sessionEnding.delete(target);
    }, sessionEndResetMs);
    timer.unref?.();
    sessionResetTimers.set(target, timer);
  }

  function attach(target) {
    target.on("query-session-end", () => beginSystemSessionEnd(target));
    target.on("session-end", () => beginSystemSessionEnd(target));
    target.on("close", (event) => {
      if (closeApproved.has(target) || sessionEnding.has(target)) return;
      event.preventDefault();
      if (pendingClose) return;

      const requestId = createRequestId();
      const timeout = setTimeout(() => {
        if (pendingClose?.requestId !== requestId) return;
        pendingClose = null;
        onFlushFailure(target, "Hết thời gian chờ lưu dữ liệu; MedNote chưa đóng.");
      }, flushTimeoutMs);
      pendingClose = { requestId, target, timeout };
      target.webContents.send("app:flush-before-close", requestId);
    });
    target.on("closed", () => {
      clearPendingClose(target);
      clearSessionReset(target);
      sessionEnding.delete(target);
    });
  }

  function handleFlushResult(sender, result = {}) {
    if (!pendingClose || sender !== pendingClose.target.webContents || result.requestId !== pendingClose.requestId) return false;
    const { target, timeout } = pendingClose;
    clearTimeout(timeout);
    pendingClose = null;
    if (!result.success) {
      onFlushFailure(target, result.error || "Không thể lưu dữ liệu; MedNote chưa đóng.");
      return true;
    }
    closeApproved.add(target);
    if (!target.isDestroyed()) target.close();
    return true;
  }

  return { attach, handleFlushResult };
}

module.exports = { createWindowCloseLifecycle };
