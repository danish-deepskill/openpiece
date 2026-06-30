/** A per-frame system. WorldScene owns the fixed update order. */
export interface System {
  update(dt: number): void;
}
