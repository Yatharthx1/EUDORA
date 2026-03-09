export default function Footer() {
  return (
    <footer
      style={{
        background: "#111008",
        borderTop: "1px solid rgba(240,235,227,0.06)",
        padding: "64px 48px",
      }}
      className="!px-6 sm:!px-8 lg:!px-12"
    >
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32, maxWidth: 1200, margin: "0 auto" }}
        className="!grid-cols-1 md:!grid-cols-3 !text-center md:!text-left"
      >
        <div>
          <p style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "0.2em", color: "#f0ebe3", marginBottom: 8 }}>
            EUDORA
          </p>
          <p style={{ fontSize: "0.85rem", color: "#9e9890", margin: 0 }}>Built for Indore.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: "0.85rem", color: "#9e9890", margin: 0 }}>
            Navigate Smarter. Breathe Better.
          </p>
        </div>
        <div className="!text-center md:!text-right" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <p style={{ fontSize: "0.85rem", color: "#9e9890", margin: 0 }}>
            &copy; 2026 EUDORA.
          </p>
        </div>
      </div>
    </footer>
  );
}
