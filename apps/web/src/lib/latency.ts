export class LatencyTracker {
  private sentTimes = new Map<number, number>();
  private history: number[] = [];
  private maxHistory = 100;

  recordSent(seq: number): void {
    this.sentTimes.set(seq, performance.now());
    // Prune very old seq entries if dropped
    if (this.sentTimes.size > 200) {
      const oldestSeq = Math.min(...Array.from(this.sentTimes.keys()));
      this.sentTimes.delete(oldestSeq);
    }
  }

  recordReceived(seq: number): number | null {
    const sentTime = this.sentTimes.get(seq);
    if (sentTime === undefined) return null;
    this.sentTimes.delete(seq);

    const rtt = performance.now() - sentTime;
    this.history.push(rtt);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    return rtt;
  }

  getStats(): { current: number; p50: number; p95: number } {
    if (this.history.length === 0) {
      return { current: 0, p50: 0, p95: 0 };
    }
    const current = this.history[this.history.length - 1];
    const sorted = [...this.history].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    return { current, p50, p95 };
  }

  reset(): void {
    this.sentTimes.clear();
    this.history = [];
  }
}

export const latencyTracker = new LatencyTracker();
