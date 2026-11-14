import { clsx } from "clsx";
import { HTMLAttributes, ReactNode } from "react";
import styles from "./Text.css";

export interface TextProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * 文字の種類
   * @default "body"
   */
  variant?: "body" | "muted" | "caption" | "statLabel" | "statValue" | "sectionTitle" | "title";
  children?: ReactNode;
}

export const Text = ({ variant = "body", className, children, ...props }: TextProps) => {
  return (
    <span className={clsx(styles.variant[variant], className)} {...props}>
      {children}
    </span>
  );
};
