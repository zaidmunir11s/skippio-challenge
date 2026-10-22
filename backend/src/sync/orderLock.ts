/**
 * In-process mutex keyed by order id.
 * Serializes critical sections for a single Node process only —
 * not safe across multiple server instances.
 */
export class OrderLock {
  private readonly tails = new Map<string, Promise<unknown>>();

  async runExclusive<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(orderId) ?? Promise.resolve();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const tail = previous.then(() => gate, () => gate);
    this.tails.set(orderId, tail);

    await previous.catch(() => undefined);

    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(orderId) === tail) {
        this.tails.delete(orderId);
      }
    }
  }
}
