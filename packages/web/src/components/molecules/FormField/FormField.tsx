import { clsx } from "clsx";
import { InputHTMLAttributes, ReactNode } from "react";
import { Col, Icon, IconName, Input } from "@components/atoms";
import styles from "./FormField.css";

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 項目ラベル。クリックで入力欄にフォーカスする。 */
  label: string;
  /** 入力欄の左端に重ねるアイコン。 */
  icon?: IconName;
  /** 入力欄の右端に重ねる要素（パスワード表示切替など）。 */
  trailing?: ReactNode;
}

/**
 * FormField — ラベル付きの1行入力欄（molecules）。
 * 左アイコンと右端の要素を入力欄に重ねて置ける。見た目の土台は Input atom。
 */
export const FormField = ({ label, icon, trailing, id, className, ...props }: FormFieldProps) => {
  return (
    <Col gap="sm">
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.field}>
        {icon ? (
          <span className={styles.icon}>
            <Icon name={icon} size={16} />
          </span>
        ) : null}
        <Input
          id={id}
          className={clsx(
            styles.input,
            icon && styles.inputWithIcon,
            trailing && styles.inputWithTrailing,
            className,
          )}
          {...props}
        />
        {trailing}
      </div>
    </Col>
  );
};
