import { clsx } from "clsx";
import { HTMLAttributes, ReactNode } from "react";
import styles from "./Badge.css";

export type BadgeTone = "accent" | "muted";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** 色調。既定は accent（強調）。未完了などの弱い状態は muted。 */
  tone?: BadgeTone;
  children?: ReactNode;
}

export const Badge = ({ tone = "accent", className, children, ...props }: BadgeProps) => {
  return (
    <span className={clsx(styles.root, styles.tone[tone], className)} {...props}>
      {children}
    </span>
  );
};
