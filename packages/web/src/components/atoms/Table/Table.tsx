import { clsx } from "clsx";
import { ReactNode, TableHTMLAttributes } from "react";
import styles from "./Table.css";

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children?: ReactNode;
}

export const Table = ({ className, children, ...props }: TableProps) => {
  return (
    <table className={clsx(styles.root, className)} {...props}>
      {children}
    </table>
  );
};
