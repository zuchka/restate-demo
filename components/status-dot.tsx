export function StatusDot({ status }: { status: "online" | "offline" | "warning" }) {
  return <span className={`status-dot status-dot--${status}`} aria-hidden="true" />;
}
