import { clsx } from "clsx";
import { HTMLAttributes, ReactNode } from "react";
import styles from "./AlertBox.css";

export interface AlertBoxProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * 通知の種類
   * @default "notice"
   */
  variant?: "notice" | "error";
  children?: ReactNode;
}

export const AlertBox = ({ variant = "notice", className, children, ...props }: AlertBoxProps) => {
  return (
    <div className={clsx(styles.root, styles.variant[variant], className)} {...props}>
      {children}
    </div>
  );
};
