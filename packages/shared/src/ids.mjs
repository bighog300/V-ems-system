export class IdGenerator {
  constructor() {
    this.counters = new Map();
  }

  next(prefix) {
    const current = this.counters.get(prefix) ?? 0;
    const next = current + 1;
    this.counters.set(prefix, next);
    return `${prefix}-${String(next).padStart(6, "0")}`;
  }
}
