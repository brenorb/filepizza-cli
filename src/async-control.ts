/** Await work with a removable abort listener; dispose late-created resources. */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal, lateCleanup?: (value: T) => void | Promise<void>): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    let cancelled = false;
    const abort = () => { cancelled = true; reject(signal.reason ?? new Error("Operation cancelled")); };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    promise.then(value => {
      signal.removeEventListener("abort", abort);
      if (cancelled) { void Promise.resolve().then(() => lateCleanup?.(value)).catch(() => {}); }
      else resolve(value);
    }, error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve(); };
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(signal?.reason ?? new Error("Operation cancelled")); };
    const timer = setTimeout(done, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
