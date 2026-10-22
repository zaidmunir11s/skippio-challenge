import { Router } from "express";
import type { OrderService } from "../services/orderService.js";

export function createOrdersRouter(orderService: OrderService): Router {
  const router = Router();

  router.get("/orders/:orderId", (req, res, next) => {
    try {
      const order = orderService.getOrder(req.params.orderId);
      res.status(200).json(order);
    } catch (error) {
      next(error);
    }
  });

  router.post("/orders/:orderId/sync", async (req, res, next) => {
    try {
      const order = await orderService.syncOrder(req.params.orderId);
      res.status(200).json(order);
    } catch (error) {
      next(error);
    }
  });

  router.post("/orders/:orderId/refund", async (req, res, next) => {
    try {
      const order = await orderService.refundOrder(req.params.orderId);
      res.status(200).json(order);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
