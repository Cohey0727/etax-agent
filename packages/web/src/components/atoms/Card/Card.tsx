import { clsx } from "clsx";
import { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export const Card = ({ className, children, ...props }: CardProps) => {
  return (
    <div className={clsx(styles.root, className)} {...props}>
      {children}
    </div>
  );
};
