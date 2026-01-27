import LRUCache from "./lruSub-cache.ts";

/*****
 * Main SLRU Cache
 *****/
export default class SLRUCache {
  probationaryLRU: LRUCache;
  protectedLRU: LRUCache;

  constructor(capacity: number) {
    // Probationary LRU Cache using existing LRU structure in lruSub-cache.ts
    this.probationaryLRU = new LRUCache(capacity * 0.20);
    // Protected LRU Cache
    this.protectedLRU = new LRUCache(capacity * 0.80);
  }

  // Get item from cache, updates last access,
  // and promotes existing items to protected
  get(key: string): any {
    // get the item from the protectedLRU
    const protectedItem = this.protectedLRU.get(key);
    // check to see if the item is in the probationaryLRU
    const probationaryItem = this.probationaryLRU.peek(key);

    // If the item is in neither segment, return undefined
    if (protectedItem === null && probationaryItem === null) return;

    // If the item only exists in the protected segment, return that item
    if (protectedItem !== null) return protectedItem;

    // If the item only exists in the probationary segment, promote to protected and return item
    // if adding an item to the protectedLRU results in ejection, demote ejected node
    this.probationaryLRU.delete(key);
    this.putAndDemote(key, probationaryItem);
    return probationaryItem;
  }

  // add or update item in cache
  put(key: string, node: any): void {
    // if the item is in the protected segment, update it
    if (this.protectedLRU.nodeHash.get(key)) this.putAndDemote(key, node);
    else if (this.probationaryLRU.nodeHash.get(key)) {
      // if the item is in the probationary segment,
      // promote and update it
      this.probationaryLRU.delete(key);
      this.putAndDemote(key, node);
    } // if in neither, add item to the probationary segment
    else this.probationaryLRU.put(key, node);
  }

  // Check to see if the item exists in the cache without updating access
  has(key: string): boolean {
    return !!(this.protectedLRU.nodeHash.get(key) ||
      this.probationaryLRU.nodeHash.get(key));
  }

  // Adds a node to the protectedLRU
  putAndDemote(key: string, value: any): void {
    // if adding an item to the protectedLRU results in ejection, demote ejected node
    const demoted = this.protectedLRU.put(key, value);
    if (demoted) this.probationaryLRU.put(demoted.key, demoted.value);
  }
}