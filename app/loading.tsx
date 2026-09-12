export default function Loading(): React.JSX.Element {
  return (
    <div
      className="vs-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "45vh",
        gap: 16,
      }}
      aria-label="Loading page content"
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "3px solid var(--vs-outline-variant, #e0e0e0)",
          borderTopColor: "var(--vs-primary, #6750a4)",
        }}
        className="vs-spin"
      />
      <span style={{ fontSize: 13, color: "var(--vs-muted, #666)", fontWeight: 500 }}>
        Loading…
      </span>
    </div>
  );
}
