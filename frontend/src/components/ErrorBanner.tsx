interface Props {
  readonly message: string;
}

export function ErrorBanner({ message }: Props) {
  return (
    <div
      style={{
        background: "rgba(239,68,68,0.15)",
        color: "#b91c1c",
        borderRadius: "12px",
        padding: "0.75rem 1rem"
      }}
    >
      {String(message)}
    </div>
  );
}
