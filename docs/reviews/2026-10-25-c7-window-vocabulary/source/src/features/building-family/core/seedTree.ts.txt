export interface SeedTree {
  readonly root: string;
  fork(path: string): SeedTree;
  uint32(path?: string): number;
  float01(path?: string): number;
  int(minInclusive: number, maxInclusive: number, path?: string): number;
  chooseWeighted<T>(items: Array<{ value: T; weight: number }>, path?: string): T;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function joinSeedPath(root: string, path?: string): string {
  return path ? `${root}/${path}` : root;
}

class StableSeedTree implements SeedTree {
  readonly root: string;

  constructor(root: string) {
    if (!root) {
      throw new Error("SeedTree root cannot be empty");
    }
    this.root = root;
  }

  fork(path: string): SeedTree {
    return new StableSeedTree(joinSeedPath(this.root, path));
  }

  uint32(path?: string): number {
    return fnv1a32(joinSeedPath(this.root, path));
  }

  float01(path?: string): number {
    return this.uint32(path) / 0x100000000;
  }

  int(minInclusive: number, maxInclusive: number, path?: string): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
      throw new Error("SeedTree.int bounds must be integers");
    }
    if (maxInclusive < minInclusive) {
      throw new Error("SeedTree.int max must be greater than or equal to min");
    }
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + (this.uint32(path) % span);
  }

  chooseWeighted<T>(items: Array<{ value: T; weight: number }>, path?: string): T {
    if (items.length === 0) {
      throw new Error("Cannot choose from an empty weighted item list");
    }

    const totalWeight = items.reduce((sum, item) => {
      if (item.weight <= 0 || !Number.isFinite(item.weight)) {
        throw new Error("Weighted choices must have positive finite weights");
      }
      return sum + item.weight;
    }, 0);

    let threshold = this.float01(path) * totalWeight;
    for (const item of items) {
      threshold -= item.weight;
      if (threshold <= 0) {
        return item.value;
      }
    }

    return items[items.length - 1].value;
  }
}

export function createSeedTree(root: string): SeedTree {
  return new StableSeedTree(root);
}

