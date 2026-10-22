import { createFakePos, type FakePosOptions } from "./pos/fakePos.js";
import { createOrderService } from "./services/orderService.js";
import { createMemoryStore } from "./store/memoryStore.js";
import { OrderLock } from "./sync/orderLock.js";

export type CreateAppContextOptions = {
  pos?: FakePosOptions;
};

export function createAppContext(options: CreateAppContextOptions = {}) {
  const store = createMemoryStore();
  const pos = createFakePos(store, options.pos);
  const orderService = createOrderService(store, pos, new OrderLock());

  return { pos, orderService };
}

export type AppContext = ReturnType<typeof createAppContext>;
