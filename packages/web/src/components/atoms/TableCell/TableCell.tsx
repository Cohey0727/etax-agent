import { clsx } from "clsx";
import { ReactNode, TdHTMLAttributes } from "react";
import styles from "./TableCell.css";

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** 横の揃え @default "left" */
  align?: "left" | "right";
  /** 文字色のトーン @default "default" */
  tone?: "default" | "positive" | "negative" | "muted";
  children?: ReactNode;
}

export const TableCell = ({
  align = "left",
  tone = "default",
  className,
  children,
  ...props
}: TableCellProps) => {
  return (
    <td className={clsx(styles.align[align], styles.tone[tone], className)} {...props}>
      {children}
    </td>
  );
};
