import { pluralize } from "pluralize";

class Node {
  key: string;
  value: any;
  next: Node | null;
  prev: Node | null;

  constructor(key: string, value: any) {
    this.key = key;
    this.value = value;
    this.next = this.prev = null;
  }
}

export default class LRUCache {
  capacity: number;
  currentSize: number;
  nodeHash: Map<string, Node>;
  head: Node;
  tail: Node;
  sketch?: any; // FrequencySketch

  constructor(capacity: number) {
    this.capacity = capacity;
    this.currentSize = 0;
    // node hash for cache lookup and storage
    this.nodeHash = new Map();

    // doubly-linked list to keep track of recency and handle eviction
    this.head = new Node("head", null);
    this.tail = new Node("tail", null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  removeNode(node: Node): void {
    const prev = node.prev!;
    const next = node.next!;
    prev.next = next;
    next.prev = prev;
  }

  addNode(node: Node): void {
    const tempTail = this.tail.prev!;
    tempTail.next = node;

    this.tail.prev = node;
    node.next = this.tail;
    node.prev = tempTail;
  }

  // Like get, but doesn't update anything
  peek(key: string): any {
    const node = this.nodeHash.get(key);
    if (!node) return null;
    return node.value;
  }

  // Like removeNode, but takes key and deletes from hash
  delete(key: string): void {
    const node = this.nodeHash.get(key);
    if (!node) return;
    const prev = node.prev!;
    const next = node.next!;
    prev.next = next;
    next.prev = prev;
    this.nodeHash.delete(key);
  }

  get(key: string): any {
    const node = this.nodeHash.get(key);

    // check if node does not exist in nodeHash obj
    if (!node) return null;
    // update position to most recent in list
    this.removeNode(node);
    this.addNode(node);
    return node.value;
  }

  // used by wTinyLFU to get SLRU eviction candidates for TinyLFU decision
  getCandidate(): { key: string; value: any } {
    const tempHead = this.head.next!;
    this.removeNode(tempHead);
    this.nodeHash.delete(tempHead.key);
    return { key: tempHead.key, value: tempHead.value };
  }

  put(key: string, value: any): { key: string; value: any } | undefined {
    // create a new node
    const newNode = new Node(key, value);

    // remove node from old position
    const node = this.nodeHash.get(key);
    if (node) this.removeNode(node);

    // add new node  to tail
    this.addNode(newNode);
    this.nodeHash.set(key, newNode);

    // check capacity - if over capacity, remove and reassign head node
    if (this.nodeHash.size > this.capacity) {
      const tempHead = this.head.next!;
      this.removeNode(tempHead);
      this.nodeHash.delete(tempHead.key);
      // return tempHead for use in w-TinyLFU's SLRU cache
      return { key: tempHead.key, value: tempHead.value };
    }
    return undefined;
  }
}