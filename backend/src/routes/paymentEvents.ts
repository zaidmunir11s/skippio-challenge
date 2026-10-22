import { Router } from "express";
import type { OrderService } from "../services/orderService.js";
import { paymentEventSchema } from "../validation/paymentEvent.js";

export function createPaymentEventsRouter(orderService: OrderService): Router {
  const router = Router();

  router.post("/payment-events", async (req, res, next) => {
    try {
      const event = paymentEventSchema.parse(req.body);
      const result = await orderService.handlePaymentEvent(event);
      res.status(result.created ? 201 : 200).json(result.order);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
