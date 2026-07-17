export function Tag({ value }: { value: string }) {
  return <span className={`tag tag-${value}`}>{value}</span>;
}
