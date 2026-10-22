import { z } from "zod";

const nonemptyId = z.string().trim().min(1, "must be a nonempty string");

const orderItemSchema = z.object({
  productId: nonemptyId,
  quantity: z.number().int().positive(),
  price: z.number().int().nonnegative(),
});

const orderSchema = z
  .object({
    id: nonemptyId,
    venueId: nonemptyId,
    currency: z.literal("EUR"),
    items: z.array(orderItemSchema).min(1),
    total: z.number().int().nonnegative(),
  })
  .superRefine((order, ctx) => {
    let calculated = 0;
    for (const item of order.items) {
      const line = item.quantity * item.price;
      if (!Number.isSafeInteger(line)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items"],
          message: "line item amount exceeds safe integer range",
        });
        return;
      }
      calculated += line;
      if (!Number.isSafeInteger(calculated)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["total"],
          message: "calculated total exceeds safe integer range",
        });
        return;
      }
    }
    if (calculated !== order.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total"],
        message: `total ${order.total} does not match calculated ${calculated}`,
      });
    }
  });

export const paymentEventSchema = z.object({
  eventId: nonemptyId,
  type: z.literal("payment.succeeded"),
  order: orderSchema,
});

export type PaymentEventInput = z.infer<typeof paymentEventSchema>;
