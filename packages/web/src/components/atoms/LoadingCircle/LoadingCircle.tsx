import { clsx } from "clsx";
import styles from "./LoadingCircle.css";

export interface LoadingCircleProps {
  className?: string;
}

export const LoadingCircle = ({ className }: LoadingCircleProps) => {
  return <span role="status" aria-label="読み込み中" className={clsx(styles.root, className)} />;
};
