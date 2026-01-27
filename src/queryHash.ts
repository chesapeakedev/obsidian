// Create hash table
class Node {
  value: { key: string; str: string };
  next: Node | null;

  constructor(key: string, str: string) {
    this.value = { key, str };
    this.next = null;
  }
}

class LinkedList {
  head: Node | null;
  tail: Node | null;

  constructor() {
    this.head = null;
    this.tail = null;
  }

  // adds a node to the end of the linked list
  addNode(key: string, str: string): void {
    if (this.head === null) {
      this.head = new Node(key, str);
      this.tail = this.head;
    } else {
      this.tail!.next = new Node(key, str);
      this.tail = this.tail!.next;
    }
  }

  // finds a node from the SHA256-hashed queryStr and returns the queryStr
  getNode(key: string): string | undefined {
    if (this.head === null) return undefined;
    let currNode = this.head;
    while (currNode) {
      if (currNode.value.key === key) return currNode.value.str;
      else currNode = currNode.next!;
    }
    return undefined;
  }
}

export class HashTable {
  SIZE: number;
  table: (LinkedList | undefined)[];

  constructor(size: number) {
    this.SIZE = size;
    this.table = new Array(this.SIZE);
  }

  // adds a value to the hashTable
  add(sha256Str: string, str: string): void {
    const index = hashSlingingSlasher(sha256Str, this.SIZE);
    // if there is nothing at that index of the hash table
    if (!this.table[index]) {
      // initialize a new linked list and add a node to it
      this.table[index] = new LinkedList();
      this.table[index]!.addNode(sha256Str, str);
      // if there is already a linked list at that index
    } else {
      // add a new node
      this.table[index]!.addNode(sha256Str, str);
    }
  }

  // gets the queryStr given the SHA256-Hashed queryStr
  get(key: string): string | undefined {
    const index = hashSlingingSlasher(key, this.SIZE);
    if (!this.table[index]) return undefined;
    return this.table[index]!.getNode(key);
  }
}

// hashing function
function hashSlingingSlasher(string: string, size: number): number {
  let hash = 0;
  if (string.length === 0) return hash;
  for (let i = 0; i < string.length; i++) {
    const letter = string.charCodeAt(i);
    hash = ((hash << 5) - hash) + letter;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % size;
}
