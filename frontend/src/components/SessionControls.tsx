import { ConnectionStatusBadge } from "./ConnectionStatusBadge";
import type { RelayStatus } from "../services/realtimeRelayClient";

interface Props {
  readonly status: RelayStatus;
  readonly streaming: boolean;
  readonly onStart: () => Promise<void>;
  readonly onPause: () => Promise<void>;
  readonly onResume: () => Promise<void>;
  readonly onStop: () => Promise<void>;
}

export function SessionControls({ status, streaming, onStart, onPause, onResume, onStop }: Props) {
  const connected = status === "connected";
  const showControls = connected;

  return (
    <section className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Networking Practice Coach</h1>
        <ConnectionStatusBadge status={status} />
      </header>

      {!connected && (
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            void onStart();
          }}
          disabled={status === "connecting"}
        >
          {status === "connecting" ? "Starting…" : "Start"}
        </button>
      )}

      {showControls && (
        <div className="controls" style={{ justifyContent: "flex-start" }}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (streaming) {
                void onPause();
              } else {
                void onResume();
              }
            }}
          >
            {streaming ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => {
              void onStop();
            }}
          >
            Stop
          </button>
        </div>
      )}
    </section>
  );
}
