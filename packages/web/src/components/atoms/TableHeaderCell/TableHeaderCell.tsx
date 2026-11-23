import { clsx } from "clsx";
import { ReactNode, ThHTMLAttributes } from "react";
import styles from "./TableHeaderCell.css";

export interface TableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** 横の揃え @default "left" */
  align?: "left" | "right";
  children?: ReactNode;
}

export const TableHeaderCell = ({
  align = "left",
  className,
  children,
  ...props
}: TableHeaderCellProps) => {
  return (
    <th className={clsx(styles.align[align], className)} {...props}>
      {children}
    </th>
  );
};
