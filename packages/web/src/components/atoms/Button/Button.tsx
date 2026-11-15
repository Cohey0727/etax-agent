import { clsx } from "clsx";
import { ButtonHTMLAttributes } from "react";
import styles from "./Button.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * ボタンの見た目のバリエーション
   * @default "primary"
   */
  variant?: "primary" | "ghost" | "tab" | "tabActive" | "nav" | "navActive" | "danger";
  /**
   * ボタンのサイズ
   * @default "sm"
   */
  size?: "sm" | "md";
  /**
   * 無効になっている理由。disabled の間だけ、ホバー／フォーカスで
   * ツールチップ表示する。無効化するボタンには原則つける。
   */
  disabledReason?: string;
}

export const Button = ({
  variant = "primary",
  size = "sm",
  className,
  disabled,
  disabledReason,
  children,
  ...props
}: ButtonProps) => {
  const button = (
    <button
      className={clsx(styles.base, styles.variant[variant], styles.size[size], className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
  // 無効なボタン自体はホバーイベントを受け取れないため、ラッパー側で受ける。
  if (disabled && disabledReason) {
    return (
      <span className={styles.tooltipWrap}>
        {button}
        <span className={styles.tooltip} role="tooltip">
          {disabledReason}
        </span>
      </span>
    );
  }
  return button;
};
