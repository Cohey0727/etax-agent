import { clsx } from "clsx";
import { TextareaHTMLAttributes } from "react";
import styles from "./Textarea.css";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = ({ className, ...props }: TextareaProps) => {
  return <textarea className={clsx(styles.root, className)} {...props} />;
};
