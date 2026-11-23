import { clsx } from "clsx";
import { InputHTMLAttributes } from "react";
import styles from "./Input.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = ({ className, ...props }: InputProps) => {
  return <input className={clsx(styles.root, className)} {...props} />;
};
