import { Button, Col, Icon, IconName, Row } from "@components/atoms";

export interface TabsProps<ViewId extends string> {
  items: readonly { id: ViewId; label: string; icon?: IconName }[];
  activeId: ViewId;
  onChange: (id: ViewId) => void;
  /**
   * 並べる向き。vertical はサイドバー用のアイコン付きナビになる。
   * @default "horizontal"
   */
  orientation?: "horizontal" | "vertical";
}

export const Tabs = <ViewId extends string>({
  items,
  activeId,
  onChange,
  orientation = "horizontal",
}: TabsProps<ViewId>) => {
  if (orientation === "vertical") {
    return (
      <Col gap="sm">
        {items.map((item) => (
          <Button
            key={item.id}
            variant={item.id === activeId ? "navActive" : "nav"}
            size="md"
            onClick={() => onChange(item.id)}
          >
            {item.icon ? <Icon name={item.icon} /> : null}
            {item.label}
          </Button>
        ))}
      </Col>
    );
  }
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
