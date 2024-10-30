import { EMITTER, ORB, Atom } from "../atom.js";
import { createEmitter, type Emitter } from "../emitter.js";
import { createTransmitterOrb, type Orb } from "../orb.js";
import { emptyFn } from "../shared.js";
import {
  ARRAY_CHANGE_STORE,
  ArrayChangeStore,
  HINT_DELETE,
  HINT_INSERT,
  HINT_SET,
  type ReadonlyArrayChangeStore,
} from "./array/change-store.js";

export const IS_ATOM_ARRAY = Symbol("Atom Array");

export abstract class AtomArray<TValue> extends Atom<ReadonlyArray<TValue>> {
  abstract readonly [ARRAY_CHANGE_STORE]: ReadonlyArrayChangeStore;
  get [IS_ATOM_ARRAY]() {
    return true;
  }
}

export function isAtomArray(value: {}): value is AtomArray<unknown> {
  return (value as { [IS_ATOM_ARRAY]?: unknown })[IS_ATOM_ARRAY] === true;
}

const INDEX_OUT_OF_BOUNDS_MESSAGE = "Index out of bounds";

export class WritableAtomArray<TValue> extends AtomArray<TValue> {
  #inner: TValue[];
  #emitter?: Emitter;
  #orb: Orb;
  #transmit: () => void;
  #emit = emptyFn;
  #changeStore?: ArrayChangeStore;
  constructor(inner: TValue[]) {
    super();
    this.#inner = inner;
    const { orb, transmit } = createTransmitterOrb();
    this.#orb = orb;
    this.#transmit = transmit;
  }
  get [ORB](): Orb {
    return this.#orb;
  }
  get [EMITTER](): Emitter {
    const existingEmitter = this.#emitter;
    if (existingEmitter !== undefined) {
      return existingEmitter;
    }

    const { emitter, emit } = createEmitter();

    this.#emitter = emitter;
    this.#emit = emit;

    return emitter;
  }
  get [ARRAY_CHANGE_STORE](): ReadonlyArrayChangeStore {
    const existingChangeStore = this.#changeStore;
    if (existingChangeStore !== undefined) {
      return existingChangeStore;
    }

    const changeStore = new ArrayChangeStore();
    this.#changeStore = changeStore;

    return changeStore;
  }
  unwrap(): ReadonlyArray<TValue> {
    return this.#inner;
  }
  set(index: number, value: TValue): this {
    const inner = this.#inner;
    const size = inner.length;
    if (index === size) {
      this.push(value);
      return this;
    }

    if (index >> 0 !== index || index < 0 || index > size) {
      throw new RangeError(INDEX_OUT_OF_BOUNDS_MESSAGE);
    }

    if (value === inner[index]) {
      return this;
    }

    inner[index] = value;
    this.#changeStore?.index(HINT_SET, index);
    this.#emit();
    this.#transmit();
    return this;
  }
  push(value: TValue): undefined {
    const inner = this.#inner;
    const oldSize = inner.length;
    inner.push(value);
    this.#changeStore?.push(oldSize, 1);
    this.#emit();
    this.#transmit();
  }
  append(values: TValue[]): undefined {
    const count = values.length;
    if (count === 0) {
      return;
    }
    const inner = this.#inner;
    const oldSize = inner.length;
    for (let i = 0; i < count; i++) {
      inner[i] = values[i]!;
    }
    this.#changeStore?.push(oldSize, count);
    this.#emit();
    this.#transmit();
  }
  insert(index: number, value: TValue): undefined {
    const inner = this.#inner;
    const oldSize = inner.length;
    if (index === oldSize) {
      return this.push(value);
    }

    if (index >> 0 !== index || index < 0 || index > oldSize) {
      throw new RangeError(INDEX_OUT_OF_BOUNDS_MESSAGE);
    }

    if (index === 0) {
      inner.unshift(value);
    } else {
      inner.splice(index, 0, value);
    }

    this.#changeStore?.index(HINT_INSERT, index);
    this.#emit();
    this.#transmit();
  }
  delete(index: number): boolean {
    const inner = this.#inner;
    const oldSize = inner.length;

    if (index >> 0 !== index || index < 0 || index >= oldSize) {
      return false;
    }

    if (index === oldSize - 1) {
      inner.pop()!;
    } else {
      inner.splice(index, 1);
    }

    this.#changeStore?.index(HINT_DELETE, index);
    this.#emit();
    this.#transmit();
    return true;
  }
  swap(indexA: number, indexB: number): undefined {
    const inner = this.#inner;
    const oldSize = inner.length;

    if (
      indexA >> 0 !== indexA ||
      indexA < 0 ||
      indexA >= oldSize ||
      indexB >> 0 !== indexB ||
      indexB < 0 ||
      indexB >= oldSize
    ) {
      throw new RangeError(INDEX_OUT_OF_BOUNDS_MESSAGE);
    }

    if (indexA === indexB) {
      return;
    }

    if (indexA > indexB) {
      // Normalize so that a < b
      return this.swap(indexB, indexA);
    }

    const temp = inner[indexA];
    inner[indexA] = inner[indexB]!;
    inner[indexB] = temp!;

    this.#changeStore?.swap(indexA, indexB);
    this.#emit();
    this.#transmit();
  }
  clear(): undefined {
    const inner = this.#inner;
    const oldSize = inner.length;
    if (oldSize === 0) {
      return;
    }
    inner.length = 0;
    this.#changeStore?.clear();
    this.#emit();
    this.#transmit();
  }
  replace(nextValues: TValue[]): undefined {
    const inner = this.#inner;
    const size = nextValues.length;
    inner.length = size;
    for (let i = 0; i < size; i++) {
      inner[i] = nextValues[i]!;
    }

    this.#changeStore?.refresh();
    this.#emit();
    this.#transmit();
  }
  static create<TValue>(values?: readonly TValue[]): WritableAtomArray<TValue> {
    return new WritableAtomArray(values === undefined ? [] : values.slice());
  }
}

export const stateArray = WritableAtomArray.create;
