import { Button, Row } from "@components/atoms";

export interface TabsProps<ViewId extends string> {
  items: readonly { id: ViewId; label: string }[];
  activeId: ViewId;
  onChange: (id: ViewId) => void;
}

export const Tabs = <ViewId extends string>({ items, activeId, onChange }: TabsProps<ViewId>) => {
  return (
    <Row gap="sm" wrap>
      {items.map((item) => (
        <Button
          key={item.id}
          variant={item.id === activeId ? "tabActive" : "tab"}
          size="md"
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </Button>
      ))}
    </Row>
  );
};
