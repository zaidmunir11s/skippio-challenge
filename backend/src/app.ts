import cors from "cors";
import express from "express";
import { createAppContext, type AppContext } from "./createAppContext.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createOrdersRouter } from "./routes/orders.js";
import { createPaymentEventsRouter } from "./routes/paymentEvents.js";

export function createApp(context: AppContext = createAppContext()) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Observable POS side effects for verification (not part of the challenge UI).
  app.get("/debug/pos-transactions", (_req, res) => {
    res.status(200).json(context.pos.listTransactions());
  });

  app.use(createPaymentEventsRouter(context.orderService));
  app.use(createOrdersRouter(context.orderService));

  app.use(errorHandler);

  return app;
}
