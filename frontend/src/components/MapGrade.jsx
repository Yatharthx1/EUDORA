export function MapGrade() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
        background: `
          radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.03), transparent 40%),
          linear-gradient(180deg, rgba(6, 7, 9, 0.25) 0%, transparent 15%, transparent 85%, rgba(6, 7, 9, 0.3) 100%)
        `,
      }}
    />
  );
}
