import {
  paymentStatusLabel,
  posStatusLabel,
} from "../status";
import type { PaymentStatus, PosStatus } from "../types";

type Props =
  | { kind: "payment"; status: PaymentStatus }
  | { kind: "pos"; status: PosStatus };

export function StatusBadge(props: Props) {
  const label =
    props.kind === "payment"
      ? paymentStatusLabel(props.status)
      : posStatusLabel(props.status);
  const tone = props.status;

  return (
    <span className={`status-badge status-badge--${tone}`} title={label}>
      <span className="status-badge__mark" aria-hidden="true" />
      <span className="status-badge__label">{label}</span>
    </span>
  );
}
