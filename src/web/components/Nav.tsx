export interface NavItem {
  key: string;
  label: string;
}

export function Nav({
  items,
  active,
  onSelect,
}: {
  items: NavItem[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav className="nav">
      {items.map((item) => (
        <button
          key={item.key}
          className={item.key === active ? "active" : ""}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
