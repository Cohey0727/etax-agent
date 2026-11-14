import { clsx } from "clsx";
import { SelectHTMLAttributes } from "react";
import styles from "./Select.css";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = ({ className, ...props }: SelectProps) => {
  return <select className={clsx(styles.root, className)} {...props} />;
};
