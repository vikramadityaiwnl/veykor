export class CommandGate {
  private active = 0;
  private waiting: Array<() => void> = [];

  constructor(private readonly limit = 2) {}

  async run<T>(action: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
      this.drain();
    });

    try {
      return await action();
    } finally {
      this.active -= 1;
      this.drain();
    }
  }

  private drain(): void {
    while (this.active < this.limit && this.waiting.length > 0) {
      const next = this.waiting.shift();

      if (next) {
        this.active += 1;
        next();
      }
    }
  }
}
