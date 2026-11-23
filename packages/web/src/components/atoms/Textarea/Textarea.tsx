import { clsx } from "clsx";
import { TextareaHTMLAttributes } from "react";
import styles from "./Textarea.css";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * テキストエリアの種類。"code" は等幅フォントの大きい入力欄
   * @default "default"
   */
  variant?: "default" | "code";
}

export const Textarea = ({ variant = "default", className, ...props }: TextareaProps) => {
  return (
    <textarea className={clsx(styles.root, styles.variant[variant], className)} {...props} />
  );
};
