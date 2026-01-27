export class FrequencySketch {
  private readonly RESET_MASK = 0x77777777; // 011101110111... 0001 0000 0000 0001 0000
  private readonly ONE_MASK = 0x11111111; //  0001 0001 0001

  private sampleSize: number = 0;
  private blockMask: number = 0;
  private size: number = 0;
  private table: number[][] = [];

  /**
   * Initializes and increases the capacity of this FrequencySketch instance
   * so it can accurately estimate the popularity of data given the maximum
   * size of the cache. Frequency counts become zero when resizing.
   *
   * @param maxSize cache capacity
   */
  updateCapacity(maxSize: number): void {
    const max = Math.floor(maxSize); //to ensure it's an integer
    if (this.table.length >= max) return;

    this.table = Array(Math.max(nearestPowerOfTwo(max), 8)).fill(0).map(() =>
      Array(2).fill(0)
    );
    this.sampleSize = (maxSize === 0) ? 10 : (10 * max);
    this.blockMask = (this.table.length >>> 3) - 1;

    if (this.sampleSize <= 0) this.sampleSize = Number.MAX_SAFE_INTEGER;
    this.size = 0;
  }

  /**
   * Returns true if the sketch has not been initialized, indicating updateCapcity
   * needs to be called before tracking frequencies.
   */
  private isNotInitialized(): boolean {
    return this.table.length === 0;
  }

  /**
   * Returns the estimated frequency of an element, up to the maximum(15).
   *
   * @param el the element being counted
   * @return the estimated frequency - required to be nonnegative
   */
  frequency(el: string): number {
    if (this.isNotInitialized()) return 0;
    const count = Array(4);

    const blockHash = supphash(hashCode(el));
    const counterHash = rehash(blockHash);
    const block = (blockHash & this.blockMask) << 3;

    for (let i = 0; i < 4; i++) {
      const h = counterHash >>> (i << 3);
      const index = (h >>> 1) & 15;
      const row = index % 2;
      const offset = h & 1;
      count[i] =
        (this.table[block + offset + (i << 1)][row] >>> ((index >> 1) << 2)) &
        15;
    }
    return Math.min(...count);
  }

  /**
   * Increment the frequency of the element if it does not exceed the maximum(15)
   * @param el element to add
   */
  increment(el: string): void {
    if (this.isNotInitialized()) return;

    const index = Array(8);
    const blockHash = supphash(hashCode(el));
    const counterHash = rehash(blockHash);
    const block = (blockHash & this.blockMask) << 3;
    //in case we get that [Object object] bs

    for (let i = 0; i < 4; i++) {
      const h = counterHash >>> (i << 3);
      index[i] = (h >>> 1) & 15;
      const offset = h & 1;
      index[i + 4] = block + offset + (i << 1);
    }
    const incremented = this.incrementAt(index[4], index[0]) |
      this.incrementAt(index[5], index[1]) |
      this.incrementAt(index[6], index[2]) |
      this.incrementAt(index[7], index[3]);
    if (incremented && (++this.size == this.sampleSize)) {
      this.reset();
    }
  }

  /**
   * Increments the specified counter by 1 if it is not already at the maximum value (15).
   *
   * @param i the table index (16 counters)
   * @param j the counter to increment
   * @return if incremented
   */
  private incrementAt(i: number, j: number): boolean {
    const row = j % 2;
    const offset = (j >> 1) << 2;
    const mask = 15 << offset;
    if ((this.table[i][row] & mask) != mask) { //if curr counter is not at maximum(15)
      this.table[i][row] += 1 << offset;
      return true;
    }
    return false;
  }

  /** Reduces every counter by half of its original value. */
  private reset(): void {
    let count = 0;
    for (let i = 0; i < this.table.length; i++) {
      count += bitCount(this.table[i][0] & this.ONE_MASK) +
        bitCount(this.table[i][1] & this.ONE_MASK);
      this.table[i][0] = (this.table[i][0] >>> 1) & this.RESET_MASK;
      this.table[i][1] = (this.table[i][1] >>> 1) & this.RESET_MASK;
    }
    this.size = (this.size - (count >>> 2)) >>> 1;
  }

  /** Applies a supplemental hash functions for less collisions. */
  private supphash(x: number): number {
    x ^= x >> 17;
    x *= 0xed5ad4bb;
    x ^= x >> 11;
    x *= 0xac4c1b51;
    x ^= x >> 15;
    return x;
  }

  /** Applies another round of hashing to acheive three round hashing. */
  private rehash(x: number): number {
    x *= 0x31848bab;
    x ^= x >> 14;
    return x;
  }

  private nearestPowerOfTwo(num: number): number {
    const exp = Math.floor(Math.log2(num));
    if (Math.pow(2, exp) === num) return num;

    return Math.pow(2, exp + 1);
  }

  private hashCode(input: string): number {
    let hash, code;
    hash = 0;
    for (let i = 0; i < input.length; i++) {
      code = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + code;
      hash = hash & hash;
    }
    return hash;
  }

  /** bitcounting for 32-bit integers (reference: https://graphics.stanford.edu/~seander/bithacks.html) */
  private bitCount(n: number): number {
    n = n - ((n >> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    const count = ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24;
    return count;
  }
}
