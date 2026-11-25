import { InputHTMLAttributes, useState } from "react";
import { Icon } from "@components/atoms";
import { FormField } from "@components/molecules/FormField";
import styles from "./PasswordField.css";

export interface PasswordFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** 項目ラベル。 */
  label: string;
}

/**
 * PasswordField — 表示／非表示を切り替えられるパスワード入力欄（molecules）。
 * 切り替え状態はこの部品の中だけの関心事で、値そのものは親が controlled で持つ。
 */
export const PasswordField = ({ label, ...props }: PasswordFieldProps) => {
  const [visible, setVisible] = useState(false);
  return (
    <FormField
      label={label}
      icon="lock"
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "パスワードを隠す" : "パスワードを表示する"}
          aria-pressed={visible}
        >
          <Icon name={visible ? "eyeOff" : "eye"} size={18} />
        </button>
      }
      {...props}
    />
  );
};
