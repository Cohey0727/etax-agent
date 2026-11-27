/** サイドバーからの移動方法。push は積む、dismissTo は履歴にあればそこまで戻り、無ければ今の画面と入れ替える。 */
export type SidebarNavigation = "push" | "dismissTo";

/**
 * サイドバーからの移動で画面を積み増さないための移動方法。ダッシュボードの上には
 * 1画面だけを積み、それ以外の画面からの移動は dismissTo にする。積み続けると、
 * 背面の画面がマウントされたまま読み込みを繰り返し、戻ったときに古い表示が残る。
 */
export function sidebarNavigation(currentPath: string, targetPath: string): SidebarNavigation {
  return currentPath === "/" && targetPath !== "/" ? "push" : "dismissTo";
}
