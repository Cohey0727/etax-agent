import { clsx } from "clsx";
import { HTMLAttributes, ReactNode } from "react";
import styles from "./Row.css";

export interface RowProps extends HTMLAttributes<HTMLDivElement> {
  /** 子要素間の間隔 @default "md" */
  gap?: "none" | "sm" | "md" | "lg";
  /** 交差軸（縦）の揃え @default "stretch" */
  align?: "start" | "center" | "end" | "stretch";
  /** 主軸（横）の揃え @default "start" */
  justify?: "start" | "center" | "end" | "spaceBetween";
  /** 折り返し @default false */
  wrap?: boolean;
  children?: ReactNode;
}

export const Row = ({
  gap = "md",
  align = "stretch",
  justify = "start",
  wrap = false,
  className,
  children,
  ...props
}: RowProps) => {
  return (
    <div
      className={clsx(
        styles.root,
        styles.gap[gap],
        styles.align[align],
        styles.justify[justify],
        wrap && styles.wrap,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};
