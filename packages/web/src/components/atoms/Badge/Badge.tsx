import { clsx } from "clsx";
import { HTMLAttributes, ReactNode } from "react";
import styles from "./Badge.css";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

export const Badge = ({ className, children, ...props }: BadgeProps) => {
  return (
    <span className={clsx(styles.root, className)} {...props}>
      {children}
    </span>
  );
};
