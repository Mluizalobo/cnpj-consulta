import { useState } from "react";
import { IconChevron } from "./Icons";

export function CollapsibleSection({ title, meta, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn"
        style={{ width: "100%", justifyContent: "space-between", padding: "14px 18px", background: "transparent", borderRadius: 0, color: "var(--text)" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <IconChevron open={open} />
          <span style={{ fontWeight: 600, fontSize: 14.5 }}>{title}</span>
        </span>
        {meta && (
          <span className="text-faint" style={{ fontSize: 12.5 }}>
            {meta}
          </span>
        )}
      </button>
      {open && <div style={{ padding: "0 18px 18px" }}>{children}</div>}
    </div>
  );
}
