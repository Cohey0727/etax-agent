import { clsx } from "clsx";
import { ButtonHTMLAttributes } from "react";
import styles from "./Button.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * ボタンの見た目のバリエーション
   * @default "primary"
   */
  variant?: "primary" | "ghost" | "tab" | "tabActive";
  /**
   * ボタンのサイズ
   * @default "sm"
   */
  size?: "sm" | "md";
}

export const Button = ({
  variant = "primary",
  size = "sm",
  className,
  ...props
}: ButtonProps) => {
  return (
    <button
      className={clsx(styles.base, styles.variant[variant], styles.size[size], className)}
      {...props}
    />
  );
};
