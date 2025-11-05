import type { RelayStatus } from "../services/realtimeRelayClient";
import { clsx } from "clsx";

interface Props {
  readonly status: RelayStatus;
}

const STATUS_LABELS: Record<RelayStatus, string> = {
  idle: "Idle",
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error"
};

export function ConnectionStatusBadge({ status }: Props) {
  const className = clsx("status-badge", status);
  return <span className={className}>{STATUS_LABELS[status]}</span>;
}
