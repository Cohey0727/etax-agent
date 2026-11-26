import { AppText, ScreenContainer } from "@/components";
import { MoreMenu } from "@/features/more";

/** その他画面。タブに出していない画面への導線を集約する。 */
export default function MoreScreen() {
  return (
    <ScreenContainer>
      <AppText size="xxl" weight="bold">
        その他
      </AppText>
      <MoreMenu />
    </ScreenContainer>
  );
}
