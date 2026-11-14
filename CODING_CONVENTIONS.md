# コーディング規約

## 概要

このドキュメントは、Cataris AI フロントエンドにおけるコーディング規約を定めるものです。
一貫性のあるコードベースを維持し、チーム開発を円滑にするために、以下の規約に従ってください。

## 技術スタック

- **フレームワーク**: React 19
- **言語**: TypeScript (Strict Mode)
- **ビルドツール**: Vite (Rolldown)
- **スタイリング**: Vanilla Extract
- **ルーティング**: Wouter
- **UIライブラリ**: 自作atoms（`src/components/atoms/`、一部はRadix UIプリミティブをラップ）

## プロジェクト構造

```
src/
├── components/       # UIコンポーネント
│   ├── atoms/        # 基本的なUIコンポーネント（ボタン、入力など）
│   ├── molecules/    # 複数のatomsを組み合わせた複雑なコンポーネント（ビジネスロジックを持たない、APIを呼び出すのはNG）
│   ├── organisms/    # 複数のatomsやmoleculesを組み合わせた複雑なコンポーネント（ドメインロジックを持つ、APIを呼び出すのはOK）
│   ├── templates/    # レイアウトコンポーネント
│   └── pages/        # ページコンポーネント
├── configs/          # 設定ファイル(Themeなど)
├── generated/        # 自動生成ファイル（orval等）- 手動編集禁止
├── types/            # 型定義
├── utils/            # ユーティリティ関数
├── routes.tsx        # ルート定義
└── main.tsx          # エントリーポイント
```

## コンポーネント規約

### 1. コンポーネントとは何か

**JSX を返すものだけがコンポーネントではない。React のコンポーネントツリー上で実行されるものはすべてコンポーネントとして扱う。**

hooks もこれに含まれる。`useMediaQuery` はレンダリングの結果を左右し、ツリーの中でしか動かない。JSX を返さないという理由で別扱いにしない。

したがって hooks も、フォルダ構成・置き場所・大きさの規則をコンポーネントと同じく守る。置き場所は各階層の `hooks/` の下にまとめる（`atoms/hooks/useMediaQuery`、`molecules/hooks/...`、`organisms/thread/hooks/...`）。どの階層に置くかは、コンポーネントと同じくドメインを含むかで決める。

### 2. コンポーネントのファイル構成

**必須**: すべてのコンポーネントは専用のフォルダに配置する

```
components/atoms/Button/
├── Button.tsx          # コンポーネント本体
├── Button.css.ts       # Vanilla Extractスタイル
├── Button.utils.ts     # このコンポーネントと一緒に使う関数（必要なときだけ）
└── index.ts            # エクスポート用
```

#### 各ファイルの役割

**`ComponentName.tsx`**

- コンポーネントのロジックとJSXを記述
- named exportを使用（default exportは使用しない）

```tsx
// ✅ 良い例
export const Button = () => { ... }

// ❌ 悪い例
export default function Button() { ... }
```

#### コンポーネントファイル内のコード順序

コンポーネントファイル内では、以下の順序でコードを記述する:

1. **型定義** (Props型、内部で使用する型など)
2. **定数** (コンポーネント外で定義する定数)
3. **コンポーネント** (メインのコンポーネント関数)
4. **helper関数** (コンポーネントで使用するユーティリティ関数)

```tsx
// ✅ 良い例
import styles from "./Button.css";

// 1. 型定義
export interface ButtonProps {
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
}

// 2. 定数
const defaultSize = "md";

// 3. コンポーネント
export const Button = ({ variant = "primary", size = defaultSize }: ButtonProps) => {
  const label = formatLabel(variant);
  return <button className={styles.root}>{label}</button>;
};

// 4. helper関数
function formatLabel(variant: string): string {
  return variant.charAt(0).toUpperCase() + variant.slice(1);
}
```

**`ComponentName.css.ts`**

- Vanilla Extractを使用したスタイル定義
- default exportでスタイルをエクスポート

```ts
import { style, styleVariants } from "@vanilla-extract/css";

export default {
  base: style({ ... }),
  variant: styleVariants({ ... }),
  size: styleVariants({ ... }),
};
```

**`index.ts`**

- コンポーネントの再エクスポートのみ
- 他のモジュールから簡潔にインポートできるようにする

```ts
export * from "./Button";
```

**`ComponentName.utils.ts`**

- このコンポーネントを使うときにだけ要る関数。外部から呼ばれる前提で書く
- 呼び出し側の文脈に依存しない形にし、コンポーネント内部の都合（state の持ち方など）を漏らさない
- 2つ以上のコンポーネントから使う関数と、特定のコンポーネントに紐づかない関数（`debounce`、金額・割合の整形など）は `src/utils/` に置く
- 同じ名前の関数を別の意味で2つ持たない。入力が違えば名前も変える（比率を受ける `formatPercent` と百分率を受ける `formatPercentPoints` のように）

外部からは必ずフォルダ経由で import する。フォルダ内のファイル（`Button.tsx` など）を直接 import しない。

### 3. コンポーネントの置き場所

**分類の基準は規模ではなく、ドメインを含むかどうか。**

| 階層 | ドメイン | 役割 | 例 |
|---|---|---|---|
| `atoms` | **含まない** | 単一責務の最小単位 | `Button` `Input` `Row` `Col` `Table` |
| `molecules` | **含まない** | atoms を組み合わせた部品 | `Modal` `Markdown` `Tabs` `ToastProvider` |
| `organisms` | 含む | ドメインの機能を持つ複合部品。ドメインでネストする | `thread/MessageBubble` `agent/AgentSelector` `artifact/ArtifactPane` |
| `templates` | — | 画面全体の骨格・アプリシェル | `PlainTemplate` `ChatUiTemplate` `Header` |
| `pages` | 含む | ルートに対応する画面 | `ThreadPage` `MonitorEventPage` `ProfilePage` |

`AgentSelector` が実装数行で済んだとしても、「エージェント」というドメインを含むので `organisms/agent` に置く。小さいから `atoms` に置く、という判断はしない。

**どんな UI になるかはドメインではない。中に何を入れるかがドメイン。** 行と列を並べる器（`Table`）は中身を props で受ける限り `atoms` に置ける。この製品の検知イベントを並べる表は `organisms/monitor` に置く。器だけなら他の製品にも持っていける。中身を器に埋め込むと持っていけなくなる。

`organisms` はドメインでネストし、各ドメインの直下に `index.ts` を置いて一括で export する。

```ts
// organisms/thread/index.ts
export * from "./MessageBubble";
export * from "./ThreadMessageList";
```

ドメインに属さない汎用部品を `organisms` 直下のドメインフォルダに置かない。汎用のままにできないなら、利用する側のドメインに属させる。

### 4. コンポーネント命名規則

**名前は挙動を表す。既にある名前との衝突を避けるためだけの名前は禁止。** `Row` が埋まっているから `Row2`、という付け方をしない。

ファイル内に閉じたローカル定義も同じ規則で判定する。export しないことは、無味な名前を許す理由にならない。

その画面・その organism 専用の部品なら、名前にドメインを入れる。ドメインを含む名前は何のための部品かを名前だけで示し、他の場所から呼ばれる余地を消す。

| NG | OK |
|---|---|
| `Row2` | `GraphDetailRow` |
| `Item` | `ThreadMessageItem` |
| `ProfileRow` | `ThreadOverviewRow` |

逆に、ドメインを含まない汎用の名前（`Row` `Field` `Panel`）を名乗れるのは `atoms` / `molecules` に置いたものだけ。汎用の名前を付けたくなったら、置き場所が間違っていないかを先に疑う。

- **コンポーネント名**: PascalCase（例: `Button`）
- **ファイル名**: コンポーネント名と一致（例: `Button.tsx`, `Button.css.ts`）
- **フォルダ名**: コンポーネント名と一致（例: `Button/`）
- **Props型**: `{ComponentName}Props`（例: `ButtonProps`）

```tsx
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = ({ variant = "default", size = "md", ...props }: ButtonProps) => {
  // ...
};
```

### 5. 標準コンポーネントを再利用する

**画面の部品は、`atoms` / `molecules` の標準コンポーネントで組み立てる。** `*.css.ts` にボタン・入力・バッジ・タブなどを書いたら、そのほとんどは失敗。同じ見た目をもう一度 CSS で書かない。

- `src/components/atoms` と `src/components/molecules` にある物で足りるなら、必ずそれを使う
- 足りない部分は、その画面専用のスタイルを足すのではなく、標準コンポーネントの props（`variant` / `size` / `color` など）を拡張してから使う
- 2つ目の画面で同じ物が要ると分かった時点で、atoms / molecules に切り出す
- ドメインを含まないのに pages や organisms の中に閉じた部品が育ったら、一般化して atoms / molecules へ移す

### 6. Props設計

- **型定義**: interfaceを使用（typeではなく）
- **拡張**: 適切なHTML要素の属性を継承
- **オプショナル**: デフォルト値を持つpropsは `?` を使用
- **ドキュメント**: 複雑なpropsにはJSDocコメントを追加

```tsx
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * ボタンの見た目のバリエーション
   * @default "default"
   */
  variant?: "default" | "outline" | "ghost";

  /**
   * ボタンのサイズ
   * @default "md"
   */
  size?: "sm" | "md" | "lg";
}
```

#### 自身の描画を取りやめる props の禁止

**コンポーネントが自身をレンダリングしなくなる props、自身のレンダリングをキャンセルするための props は禁止。** 対象は次の 2 つ。

- 受け取った値で `return null` / `return undefined` を返し、自身をレンダリングしなくなるもの。対象は `hidden` / `visible` のような描かないための props で、データが空のときに描かないのは対象外
- 受け取った値で、自身の主たる部分をレンダリングしなくなるもの（カードがカードの枠を描かなくなる、など）。atom の見た目の種類も対象で、`Card` の `emphasis="none"`（枠を持たない）のような種類を持たせない

自身の一部をレンダリングしないのは問題ない。禁止するのは、自身そのものと自身の主たる部分。

レンダリングするかどうか、カードで包むかどうかは呼び出し元でコントロールする。

```tsx
// ❌ 悪い例: props を受けて自身をレンダリングしない
export function MaterialChip({ material, hidden }: MaterialChipProps) {
  if (hidden) return null;
  return <Chip>{material.name}</Chip>;
}

<MaterialChip material={material} hidden={material.deletedAt !== null} />;

// ✅ 良い例: レンダリングするかどうかは呼び出し元でコントロールする
{material.deletedAt === null && <MaterialChip material={material} />}
```

```tsx
// ❌ 悪い例: Card が、emphasis="none" を受けてカードの枠を描かなくなる
export function Card({ emphasis = "normal", children, className }: CardProps) {
  // emphasis.none は枠を持たない
  return <div className={clsx(styles.root, styles.emphasis[emphasis], className)}>{children}</div>;
}

<Card emphasis="none">
  <MaterialApplicationCandidateContent candidate={candidate} />
</Card>;

// ❌ 悪い例: Card が、props を受けてカードをレンダリングせず、children をそのまま返す
export function Card({ noframes, children, className }: CardProps) {
  if (noframes) return <>{children}</>;
  return <div className={clsx(styles.root, className)}>{children}</div>;
}

// ✅ 良い例: カードで包むかどうかは呼び出し元でコントロールする
export function MaterialApplicationCandidateContent({
  candidate,
}: MaterialApplicationCandidateContentProps) {
  return <span>{candidate.name}</span>;
}

// 一覧ではカードで包む
<Card padding="compact">
  <MaterialApplicationCandidateContent candidate={candidate} />
</Card>;

// 枠の要らない場所ではそのまま置く
<MaterialApplicationCandidateContent candidate={candidate} />;
```

例外:

- 認証系などは特別に扱う
- fallback を用意するなどは OK

### 7. forwardRefの禁止

React 19では`forwardRef`は不要です。`ref`は通常のpropsとして渡されるため、`...props`で自動的に受け取れます。

```tsx
// ✅ 良い例
export function Button({ className, ...props }: ButtonProps) {
  return <button className={className} {...props} />;
}

// ❌ 悪い例
export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  return <button ref={ref} {...props} />;
});
```

### 8. 大きさ

**300 行を超えるコンポーネントは禁止。**

超えたら分割する。1 つのコンポーネントが持つ関心事は 1 つか、少数に留める。分割するときは、切り出した側が他の場所でも使える形になっているかを確認する。

## state の規約

### props や他の state に合わせて state を書き換えない（必須）

state は、ユーザーの操作や外部から届いた変化を受けて、そのイベントの中で書き換える。props・サーバーの値・他の state が変わったことをきっかけに state を書き換えない。effect で拾う書き方も、前回の値を state に複製して描画中に比べる書き方もしない。

```tsx
// ❌ 変化を effect で拾って state を合わせる
useEffect(() => {
  setActiveIndex(0);
}, [filtered]);

// ❌ 前回の値を state に複製し、描画中に比べて書き換える (lint は通るが同じ問題を抱える)
const [prevFiltered, setPrevFiltered] = useState(filtered);
if (prevFiltered !== filtered) {
  setPrevFiltered(filtered);
  setActiveIndex(0);
}

// ✅ 変化を起こした操作で一緒に書き換え、範囲を超えた分は描画で詰める
const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
  setQuery(e.target.value);
  setActiveIndex(0);
};
const activeItemIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));
```

代わりに次のどれかで書く。

| 場面 | 書き方 |
| --- | --- |
| 変化がユーザーの操作から起きる | その操作のハンドラで、関係する state を一緒に書き換える |
| 描画中に求められる | state に持たず、描画中に求める。範囲を超えた index は state を直さず描画で詰める |
| サーバーの値を初期値にした編集欄 | 入力中の値だけを state に持ち (手を入れていない間は `null`)、表示する値は `draft ?? サーバーの値` で求める。保存したら `null` に戻す |
| X が変わったら捨てたい state | 選んだときの X (ID など) と組にして持ち、描画では X が一致するときだけ使う。子の state をまるごと捨ててよいなら、子に渡す `key` を X にする |
| 親と子で同じ値を持ちたくなる | 親に持ち上げ、子は props で受け取る |

effect で state を書いてよいのは、外部 (タイマー・購読・SSE・外部ライブラリ) から届いた変化を、そのコールバックの中で写すときだけ。サーバーから届いた変化でしか分からない出来事 (生成の完了など) は effect で見張ってよいが、そこで state を書く前に、その値を描画中に求められないかを考える。

### イベントを props で渡さない（必須）

「入力欄へ文字列を差し込む」「この分子へジャンプする」のような一度きりの指示を、`{ nonce, value }` のような props にして子の effect で処理しない。値を親に持ち上げてイベントの中で書き換えるか、URL などの共有している state に書く。フォーカスやスクロールなどの DOM 操作だけは、子が `useImperativeHandle` で関数を渡す。

### ref を描画中に読み書きしない（必須）

`ref.current` を描画中に読まない・書かない。描画に使う値は state にする。コールバックが最新の値を読むための ref は、その値を書き換えるイベントの中で一緒に書く。

### lint の指摘は設計で直す（必須）

`set-state-in-effect` / `refs` などの React の lint に指摘されたら、上の書き方へ直す。指摘を消すことだけを目的に、描画中に前回の値と比べる形へ移したり、除外のコメントを足したりしない。

## 画面の規約

### 画面は共通テンプレートで包む

**画面（`components/pages`）は `templates` の共通レイアウトで包む。** ヘッダー・サイドナビ・本文の枠を画面ごとに作り直さない。`routes.tsx` でテンプレートを被せる（`withPlainTemplate(MonitorEventPage)`、`ChatUiTemplate` など）。

- 画面側に全体骨格のスタイル（画面いっぱいの縦並びなど）を新設しない
- 余白は包む側（テンプレート）が持つ。画面ごとに同じ余白を作り直さない

### 画面のタイトル

**画面にタイトルの見出し（`h1` など）を置かない。** 何の画面かはナビゲーションやヘッダーが既に示している。見出しを置くと同じ語が2か所に並び、縦の余白だけが増える。見出しを置くのは、タブやモーダルのような画面の中の節に限る。

### 読み込み中は共通部品を置く

**読み込み中は `LoadingCircle` などの共通部品をそのまま置く。** 包む要素や画面ごとの `loading` スタイルを作らない。インラインの進捗表示が要る場合は `ShimmerText` を使う。

### 0 と null で置き場所を消さない

**値が 0 や null でも、その値が入る場所は消さない。** 数は `0`、値の無い欄は `—` を出す。場所ごと消すと、「数えたら 0 だった」のか「まだ値が無い」のかを利用者が区別できない。項目の位置も画面ごとに変わり、同じ画面を見比べられなくなる。

**扱いの対象そのものが無いとき**（その表がこのデータを対象にしていないなど）だけ、置き場所を作らない。「値が 0」と「置き場所が無い」は別のことなので、混ぜない。

### 表の行から対象へ辿れるようにする

**表の行が指す対象は、その対象の画面への `Link` にする。** 名前を素の文字で出すと、そこで行き止まりになる。1つの相手に決まらない行だけリンクにしない。

リンクにする id を持っていないなら、API がその id を返すようにする。名前から id を引き直したり、URL を組み立てるための対応表を画面に持ったりしない。

## モーダル

**開閉 state を画面に持たず、`modal.open` で呼ぶ。**

```tsx
const confirmed = await modal.open(ConfirmModal, { title, message });
```

- 中身のコンポーネントは `ModalBaseProps`（`open` / `actions`）を受け取る
- 成功で閉じるときは `actions.resolve`、取りやめるときは `actions.reject` を呼ぶ
- `window.alert` / `window.confirm` は使わない

## TypeScript規約

### 1. 型定義

- **strictモード**: 必ず有効にする
- **any**: 使用禁止（どうしても必要な場合はunknownを使用）
- **型推論**: 可能な限り型推論を活用し、明示的な型注釈は必要な場合のみ
- **Import Type**: 型のみをインポートする場合でも `import type` を使用しない

```tsx
// ✅ 良い例
import { ButtonHTMLAttributes } from "react";

// ❌ 悪い例
import type { ButtonHTMLAttributes } from "react";
```

### 2. 列挙可能な分岐は写像で書く（必須）

**キーの集合が型として閉じている（union / enum / zod enum）分岐は、`if` や `&&` の羅列ではなく表で表現する。**
対象はコンポーネントに限らない。値・アイコン・関数・コンポーネントのいずれでも同じ。

手続きで書くと、機械が守れる 3 つが人間のレビューに移る。

- **網羅性**: キーを増やしたときの実装漏れが検出されず、「タブは出るが中身が空」という静かな壊れ方をする
- **対応関係**: ラベル・並び順・中身が別々の場所に散り、片方だけ変更できてしまう
- **排他性**: 実体は「1 つを選ぶ」なのに「独立した N 個の真偽判定が高々 1 つ真になる」と書かれる

#### ① もともとインターフェースが同じ（値・アイコン・同型の関数）

**羅列は NG。表で書く。**

```tsx
// ❌ 悪い例: 同じキーに対するアイコンとラベルが、枝ごとに書き下されている
<div>
  {status === "ACTIVE" && (
    <>
      <CheckIcon />
      <span>有効</span>
    </>
  )}
  {status === "INVITED" && (
    <>
      <MailIcon />
      <span>招待中</span>
    </>
  )}
  {status === "DISABLED" && (
    <>
      <BanIcon />
      <span>無効</span>
    </>
  )}
</div>;

// ✅ 良い例: 同じキーの属性は 1 つの表にまとめる。キーを足したら型エラーになる
const statuses = {
  ACTIVE: { label: "有効", Icon: CheckIcon },
  INVITED: { label: "招待中", Icon: MailIcon },
  DISABLED: { label: "無効", Icon: BanIcon },
} as const satisfies Record<AdminStatus, { label: string; Icon: ComponentType }>;

const { label, Icon } = statuses[status];

<div>
  <Icon />
  <span>{label}</span>
</div>;
```

同じキー集合に対する表を複数作らない。`statusLabels` と `statusIcons` に割ると、キーを足したとき
片方だけ書いて終われてしまい、分裂が復活する。属性が増えたら列を増やす。

#### ② 同一ドメインで並列な関係（`〇〇Step` / `Org〇〇Section` など）

**羅列は NG。props を揃えるか Provider で配って、表で書く。**

```tsx
// ❌ 手続き: 同じ集合の「ラベル・並び」と「中身」が別の場所に分裂している
const navItems = [
  { id: "info", label: "基本情報" },
  { id: "members", label: "メンバー" },
];

<div>
  {activeSection === "info" && <OrgInfoSection organization={org} onSave={handleSave} />}
  {activeSection === "members" && <OrgMembersSection organization={org} onAdd={handleAdd} />}
</div>;
```

```tsx
// ❌ 写像にしただけ: 引数をレンダー中のクロージャから受け取っている
const sectionRenderers: Record<Section, () => ReactNode> = {
  info: () => <OrgInfoSection organization={org} onSave={handleSave} />,
  members: () => <OrgMembersSection organization={org} onAdd={handleAdd} />,
};

// △ 変化する値を引数で受け取れば、全エントリが同じシグネチャになる。ただし handleSave /
//   handleAdd をクロージャから取っている限り、この表はレンダー中でしか定義できない
const sectionRenderers: Record<Section, (org: Organization) => ReactNode> = {
  info: (org) => <OrgInfoSection organization={org} onSave={handleSave} />,
  members: (org) => <OrgMembersSection organization={org} onAdd={handleAdd} />,
};
```

```tsx
// ✅ props を揃える: 全セクションが同じ SectionProps を受け取る
type SectionProps = {
  organization: Organization;
  onSave: () => void;
  onAdd: () => void;
};

function OrgInfoSection({ organization, onSave }: SectionProps) { ... }
function OrgMembersSection({ organization, onAdd }: SectionProps) { ... }

const navSections = [
  { id: "info", label: "基本情報", Component: OrgInfoSection },
  { id: "members", label: "メンバー", Component: OrgMembersSection },
] as const satisfies readonly {
  id: string;
  label: string;
  Component: ComponentType<SectionProps>;
}[];

type Section = (typeof navSections)[number]["id"];

const { Component } = navSections.find((s) => s.id === activeSection) ?? navSections[0];

<nav>
  {navSections.map(({ id, label }) => (
    <Button key={id} variant="ghost" onClick={() => setActiveSection(id)}>
      {label}
    </Button>
  ))}
</nav>
<Component organization={org} onSave={handleSave} onAdd={handleAdd} />;
```

```tsx
// ✅ 値が多い / 枝ごとに使う値がばらつくなら Provider で配り、props を無くす
function OrgInfoSection() {
  const { organization, onSave } = useOrganizationDetail();
  ...
}

<OrganizationDetailProvider value={value}>
  <Component />
</OrganizationDetailProvider>;
```

共通 props 型で揃えたコンポーネント群は汎用部品ではなくなる。`SectionProps` を受け取る時点で
その画面専用の兄弟なので、置き場所も呼び出し元の近く（そのページ / 機能のディレクトリ配下）にする。
汎用 `atoms` や他機能の `organisms` を表に載せたいときは、汎用側を曲げずラッパー 1 枚で揃える。

#### Context を値の詰め合わせにしない（必須）

②で Provider を使う場合でも、**画面のローカル state・ハンドラ・mutation の pending を全部 1 つの
context に載せてはいけない。** context に載せてよいのは、識別子（`organizationId` 等）と、
本当に全員が使う少数の値だけ。データと操作は各コンポーネントが自分で引く。

```tsx
// ❌ 悪い例: 画面の実装詳細を全部 1 つの context に詰めた「神コンテキスト」
type OrganizationDetailContextValue = {
  organization: Organization;
  editValues: { name: string; slug: string };
  onEditChange: (values: { name: string; slug: string }) => void;
  onSaveInfo: () => void;
  onCancelInfo: () => void;
  isSavingInfo: boolean;
  creditMode: CreditMode;
  onCreditModeChange: (mode: CreditMode) => void;
  // ...さらに 20 個
};
```

- どのセクションが何を使うのか読めず、1 フィールドの変更が全セクションに波及する
- 値が 1 つ変わるだけで購読者全員が再レンダーされる
- context の型が画面の実装詳細の総和になり、セクションに分けた意味が消える
- 結局は「巨大な手続きの塊」が場所を変えただけで、ページの肥大は解消していない

```tsx
// ✅ 良い例: context / props は識別子だけ。データと操作は各セクションが自分で持つ
interface SectionProps {
  organizationId: string;
}

function OrgInfoSection({ organizationId }: SectionProps) {
  const { data } = useGetAdminOrganization(organizationId); // 生成フックなのでキャッシュは共有される
  const { mutateAsync: updateOrganizationAsync, isPending } = useUpdateAdminOrganization();
  const [editValues, setEditValues] = useState<{ name: string; slug: string } | null>(null);
  ...
}
```

目安として、context のフィールドが数個を超えたら設計を疑う。増える場合は context を関心ごとに
分割するか、そもそも子が自分で取得する形に寄せる。

#### ③ 排他的だが、ドメインが違う / 並列でない / 返る型もばらばら

**`&&` / `switch` / `if` で手続き的に書いてよい。** 無理に表へ押し込むと、共通 props が
「使わない値の詰め合わせ」になり、キャストや `any` で型を殺すことになる。判別ユニオンなら
`switch` + `never` で網羅だけ型に守らせる。

```tsx
// ✅ 枝ごとに payload の型が変わるので、表ではなく switch で書く
switch (input.kind) {
  case "text":
    return renderText(input.body);
  case "artifact":
    return renderArtifact(input.artifactId, input.revision);
  default:
    return input satisfies never;
}
```

#### 表をレンダー中で組み立てない（必須）

表はモジュールのトップレベルに置き、エントリには JSX 要素ではなく**コンポーネント参照**を書く。

```tsx
// ❌ レンダーのたびに作られる表。ページの外に出せず、テストからも参照できない
const tabs = useMemo(
  () => [
    { title: "基本情報", content: <OrganizationInfo organization={org} /> },
    { title: "メンバー", content: <OrgMemberList users={org.users} /> },
  ],
  [org],
);

// ✅ 表はトップレベルに置き、エントリにはコンポーネント参照を書く。各コンポーネントの props を
//   organization に揃え、org はレンダー中に props で渡す
const organizationTabs = [
  { title: "基本情報", Component: OrganizationInfo },
  { title: "メンバー", Component: OrgMemberList },
] as const satisfies readonly {
  title: string;
  Component: ComponentType<{ organization: Organization }>;
}[];

const { Component } = organizationTabs[activeTabIndex];

<Component organization={org} />;
```

表示可否やラベルが実行時の値で変わる場合も表自体はトップレベルに置き、`isVisible(context)` /
`label(context)` のように引数で受け取る関数をエントリに持たせる。レンダー中に組み立てるのは
表ではなく、表へ渡す引数（props / context の値）だけにする。

### 3. 数値として計算できる値に string 型を使わない（全面禁止）

**件数・金額・クレジット・割合など、計算・比較・集計できる値に `string` 型を使うことは全面禁止。例外は作らない。**
状態・props・API の型・入力欄の値のどこでも `number` で持つ。空欄は `null` で表す。
桁区切りや小数の桁数をそろえた表示用の文字列は、画面に出す直前 (JSX) でだけ作り、変数や props として持ち回らない。

理由: 一度文字列にすると、合計・差・並べ替え・比較のたびに数値へ戻す処理が要り、桁区切りや丸めで値も変わる。型で数値であることも守れなくなる。

```tsx
// ❌ 悪い例: 整形済みの文字列を props で渡す
<CreditRemaining remaining={remaining.toLocaleString("ja-JP")} />;

// ✅ 良い例: 数値のまま渡し、表示するところで整形する
<CreditRemaining remaining={remaining} />;

function CreditRemaining({ remaining }: { remaining: number }) {
  return <span>残り {remaining.toLocaleString("ja-JP", { maximumFractionDigits: 4 })} クレジット</span>;
}
```

```tsx
// ❌ 悪い例: 数値の入力欄の値を文字列の状態で持ち、使うたびに変換する
const [quantity, setQuantity] = useState("");
const total = Number(quantity) * unitPrice;
<Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />;

// ✅ 良い例: 入力を受け取った時点で数値にし、空欄は null で持つ
const [quantity, setQuantity] = useState<number | null>(null);
const total = (quantity ?? 0) * unitPrice;
<Input
  type="number"
  value={quantity ?? ""}
  onChange={(e) => setQuantity(Number.isNaN(e.target.valueAsNumber) ? null : e.target.valueAsNumber)}
/>;
```

### 4. string 型の値を比較しない（全面禁止）

**`string` 型の値の比較（`===` / `!==` / `switch` の `case`）は全面禁止。比較してよいのは enum の型を持つ値だけ。**
enum は `as const` のオブジェクトと、その `typeof` から作った型を同じ名前で定義する。API の enum は生成されたものがこの形なので、そのまま使う。
enum の型を持つ値は、文字列リテラルと比較してよい。URL・ストレージなど外から受け取った文字列は、受け取った時点で enum に変換する。

理由: `string` 型の値との比較は、タイプミスや存在しない値を書いても型で検出できない。enum の型を持つ値なら、ありえない値と比較した時点で型エラーになる。

```tsx
// ❌ 悪い例: props を string 型で受け取って比較する
function ArtifactBadge({ status }: { status: string }) {
  if (status === "DONE") { ... }
}

// ✅ 良い例: 生成された enum の型で受け取る。ありえない値と比較すると型エラーになる
function ArtifactBadge({ status }: { status: ArtifactStatus }) {
  if (status === "DONE") { ... }
}
```

```tsx
// ❌ 悪い例: URL から受け取った string のまま比較する
const tab = new URLSearchParams(search).get("tab");
if (tab === "members") { ... }

// ✅ 良い例: enum を定義し、受け取った時点で enum に変換してから比較する
const Tab = {
  Info: "info",
  Members: "members",
} as const;
type Tab = (typeof Tab)[keyof typeof Tab];

const [tab, setTab] = useUrlState("tab", z.enum(Tab), Tab.Info);
if (tab === "members") { ... }
```

## レイアウト規約

### 1. ColとRowの使用（必須）

**フレックスボックスによるレイアウトには、CSSで`display: flex`を書くのではなく、必ず`Row`/`Col`コンポーネントを使用すること。**

#### Col（縦方向レイアウト）

`flex-direction: column`のレイアウトに使用する。

```tsx
import { Col } from "@components/atoms";

// ✅ 良い例
<Col gap="md" align="center">
  <h2>タイトル</h2>
  <p>説明文</p>
</Col>

// ❌ 悪い例: CSSで直接flexを記述
<div className={styles.container}>  // display: flex, flexDirection: column
  <h2>タイトル</h2>
  <p>説明文</p>
</div>
```

#### Row（横方向レイアウト）

`flex-direction: row`のレイアウトに使用する。

```tsx
import { Row } from "@components/atoms";

// ✅ 良い例
<Row gap="lg" align="center" justify="space-between">
  <span>ラベル</span>
  <span>値</span>
</Row>

// ❌ 悪い例: CSSで直接flexを記述
<div className={styles.header}>  // display: flex, justifyContent: space-between
  <span>ラベル</span>
  <span>値</span>
</div>
```

### 2. 要素間のスペースにはgapを使用

要素間のスペースには`margin`ではなく、Row/Colの`gap`プロパティを使用すること。

```tsx
// ✅ 良い例: gapでスペースを確保
<Col gap="md">
  <h2 className={styles.title}>タイトル</h2>
  <p className={styles.description}>説明文</p>
  <Button>アクション</Button>
</Col>

// ❌ 悪い例: marginでスペースを確保
<div>
  <h2 className={styles.title}>タイトル</h2>  // marginBottom: theme.space.md
  <p className={styles.description}>説明文</p>  // marginBottom: theme.space.md
  <Button>アクション</Button>
</div>
```

#### marginを使用してよい場合

- コンテナの外側のスペース（`padding`で代替できない場合）

特定の要素だけ異なるスペースが必要な場合も、兄弟要素に margin を付けず Row/Col のネストで解決する。

```tsx
// ❌ 悪い例: 見出しと説明の間だけ狭くするために、兄弟要素に margin を付ける
<div>
  <h2 className={styles.title}>タイトル</h2>  // marginBottom: theme.space.sm
  <p className={styles.description}>説明文</p>  // marginBottom: theme.space.xl
  <Section />
</div>

// ✅ 良い例: 間隔の違うまとまりを Col でネストし、それぞれの gap で取る
<Col gap="xl">
  <Col gap="sm">
    <h2 className={styles.title}>タイトル</h2>
    <p className={styles.description}>説明文</p>
  </Col>
  <Section />
</Col>
```

## スタイリング規約

### 1. Vanilla Extract

すべてのスタイルは Vanilla Extract を使用して定義する。

#### スタイルオブジェクトの定義

スタイルは1つの`styles`オブジェクト内で定義し、`export default`でエクスポートする。

```ts
// ComponentName.css.ts
import { style, styleVariants, keyframes } from "@vanilla-extract/css";
import { theme } from "@configs";

// keyframesはオブジェクトの外で定義
const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

// スタイルは1つのオブジェクトにまとめて定義
const styles = {
  root: style({
    display: "flex",
    alignItems: "center",
    borderRadius: theme.borderRadius.md,
  }),

  content: style({
    padding: theme.space.md,
    animation: `${fadeIn} 300ms ease-in-out`,
    selectors: {
      "&:hover": {
        backgroundColor: `${theme.colors.primary}1A`,
      },
    },
  }),

  // styleVariantsも同様にオブジェクト内で定義
  variant: styleVariants({
    filled: { backgroundColor: theme.colors.primary },
    outlined: { border: `1px solid ${theme.colors.primary}` },
    ghost: { backgroundColor: "transparent" },
  }),

  size: styleVariants({
    sm: { height: "2rem", fontSize: theme.fontSizes.xs },
    md: { height: "2.5rem", fontSize: theme.fontSizes.sm },
    lg: { height: "3rem", fontSize: theme.fontSizes.lg },
  }),
};

export default styles;
```

#### 避けるべきパターン

```ts
// ❌ 悪い例: 個別に定義して後からオブジェクトにまとめる
const base = style({ ... });
const variant = styleVariants({ ... });

export default { base, variant };

// ✅ 良い例: 1つのオブジェクト内で定義
const styles = {
  base: style({ ... }),
  variant: styleVariants({ ... }),
};

export default styles;
```

### 2. レスポンシブデザイン

#### モバイルファースト

スタイルは**モバイルファースト**で記述する。デフォルトのスタイルをモバイル向けに定義し、`@media`でデスクトップ向けのスタイルを上書きする。

```ts
// ✅ 良い例: モバイルファースト
const styles = {
  container: style({
    flexDirection: "column",  // モバイル: 縦並び
    padding: theme.space.sm,
    "@media": {
      [mediaquery.md]: {
        flexDirection: "row",  // デスクトップ: 横並び
        padding: theme.space.xl,
      },
    },
  }),
};

// ❌ 悪い例: デスクトップファースト（max-widthを使用）
const styles = {
  container: style({
    flexDirection: "row",
    "@media": {
      "(max-width: 768px)": {
        flexDirection: "column",
      },
    },
  }),
};
```

#### mediaqueryの使用

メディアクエリには`@configs`からインポートした`mediaquery`を使用する。ブレークポイントの値を直接記述しない。

```ts
import { mediaquery, theme } from "@configs";

// ✅ 良い例
const styles = {
  content: style({
    width: "100%",
    "@media": {
      [mediaquery.md]: {
        width: 480,
      },
    },
  }),
};

// ❌ 悪い例: ブレークポイントを直接記述
const styles = {
  content: style({
    "@media": {
      "(min-width: 768px)": { ... },
      [`(min-width: ${breakpoints.md}px)`]: { ... },
    },
  }),
};
```

#### 利用可能なブレークポイント

| キー | 値 | 用途 |
|------|-----|------|
| `xs` | 480px | 小型モバイル |
| `sm` | 640px | モバイル |
| `md` | 768px | タブレット / デスクトップ切り替え |
| `lg` | 1024px | デスクトップ |
| `xl` | 1280px | 大型デスクトップ |
| `xxl` | 1536px | 超大型デスクトップ |

#### コンテンツの出し分け

デスクトップとモバイルでコンポーネントやコンテンツを出し分ける場合は、`useMediaQuery`フックを使用する。

```tsx
import { useMediaQuery } from "@components/atoms";

export function MyComponent() {
  const isDesktop = useMediaQuery("md"); // 768px以上でtrue

  return (
    <div>
      {isDesktop ? (
        <DesktopNavigation />
      ) : (
        <MobileNavigation />
      )}
    </div>
  );
}
```

**出し分けの原則**: DOM が変わる切り替え（別コンポーネント・別データ取得・別レイアウト）は `useMediaQuery` で判定し、当てはまらない側は**そもそもレンダリングしない**。CSS の `@media` は、DOM と取得処理が変わらない純粋な見た目の調整（余白・サイズ・折り返し）に限る。

CSS で隠すと、見えていないだけで DOM に残り、中身の取得や副作用も走る。モバイルでサイドナビを `display: none` にするのではなく、組み立てない。

```tsx
// ✅ 良い例: コンポーネントの切り替えが必要な場合
const isDesktop = useMediaQuery("md");
return isDesktop ? <DataTable data={data} /> : <CardList data={data} />;
```

```tsx
// ❌ 悪い例: モバイルでは @media の display: none で隠す。見えていないだけで DOM に残り、中身の取得も走る
return <Sidebar className={styles.desktopOnly} />; // desktopOnly: display: none、mediaquery.md で display: block

// ✅ 良い例: モバイルではレンダリングしない
const isDesktop = useMediaQuery("md");
return isDesktop && <Sidebar />;
```

### 3. クラス名の結合

複数のクラス名を結合する場合は`clsx`を使用する。

```tsx
import { clsx } from "clsx";

// ✅ 良い例
className={clsx(styles.base, styles.variant[variant], className)}

// 条件付きクラス
className={clsx(styles.base, isActive && styles.active, className)}

// ❌ 悪い例（テンプレートリテラルは使用しない）
className={`${styles.base} ${styles.variant[variant]} ${className || ""}`}
```

## エクスポート

- **named export**: 優先的に使用
- **default export**: スタイルファイルのみ使用可
- **re-export**: index.tsで他のモジュールから簡潔にインポートできるようにする
- **フォルダ経由**: 外部からはフォルダの `index.ts` を経由して import する。フォルダ内のファイルを直接 import しない

```ts
// index.ts
export * from "./Button";
export * from "./Input";
```

## コード品質

### 1. Linting

コミット前に必ずlintを実行する。bun fmt・oxlint・TypeScript型チェックがまとめて実行される。

```bash
bun run lint  # bun fmt --check && oxlint --deny-warnings . && bun check -b
```

### 2. 型チェック

TypeScriptの型エラーはすべて解決してからコミットする。

```bash
bun check -b
```

### 3. 命名規則

#### UPPER_SNAKE_CASEの使用

**UPPER_SNAKE_CASE は以下の場合に使用可。オブジェクトには使用禁止。**

- 環境変数名および環境変数から読み取った値
- モジュールスコープの純粋な定数（プリミティブ値）


```ts
// ✅ 良い例: 環境変数（モジュールスコープ）
const API_URL = import.meta.env.VITE_API_BASE_URL;
const APP_ENV = import.meta.env.VITE_APP_ENV;

// ✅ 良い例: モジュールスコープのプリミティブな定数
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ❌ 悪い例: オブジェクトにUPPER_SNAKE_CASEを使用
const DEFAULT_CONFIG = { timeout: 5000, retries: 3 };

// ✅ 良い例: オブジェクトはcamelCase
const defaultConfig = { timeout: 5000, retries: 3 };

// ❌ 悪い例: 関数スコープ内でUPPER_SNAKE_CASEを使用
function fetchData() {
  const MAX_RETRIES = 3;
  const BASE_URL = "/api";
}

// ✅ 良い例: 関数スコープ内はcamelCase
function fetchData() {
  const maxRetries = 3;
  const baseUrl = "/api";
}
```

#### 基本ルール

- **変数・関数**: camelCase（例: `userName`, `handleClick`）
- **定数**: camelCase（例: `maxRetries`, `defaultTimeout`）
- **コンポーネント**: PascalCase（例: `Button`, `HomePage`）
- **型・インターフェース**: PascalCase（例: `ButtonProps`, `User`）
- **enum**: オブジェクトと型を同じ PascalCase の名前にする（例: `Tab`, `ArtifactStatus`）

### 4. 禁止事項

#### `window.alert()` の使用禁止

**`window.alert()` は使用禁止。代わりに `modal.open(AlertModal, { message })` を使用する。**

```ts
// ❌ 禁止
alert("エラーが発生しました");

// ✅ 良い例
import { AlertModal, modal } from "@components/molecules";
modal.open(AlertModal, { message: "エラーが発生しました" });

// ✅ 良い例: タイトルを指定
modal.open(AlertModal, { title: "確認", message: "本当によろしいですか？" });
```

#### 中身のないラッパー関数の定義禁止

**判定基準は「名前と本体のどちらが読み手に多くを伝えるか」。** 名前が本体より情報を持っていないなら、それは抽象化ではなく目隠しで、無いほうがよい。

```ts
// ❌ 悪い例: 名前からは上位ワードがどちらか分からない
makeU32FromTwoU16(a, b);

// ✅ 良い例: 式そのものが語順を語る
(a << 16) + b;
```

呼び出し元が多いことは、残す理由にはならない。読み手を迷わせる名前は、呼び出し元が多いほど曖昧さが広い範囲に伝播する。とくに悪いのは**受け取った引数を本体が使っていない関数**で、シグネチャが嘘をついている。

逆に、本体だけでは読めない規則を名前が述べているなら残す。`P2034` が何を指すかは本体を見ても分からないので、`isSerializationConflict` は名前のほうが情報を持っている。

**呼び出し先に何も足さない関数は定義しない。** 引数を素通しし、戻り値も素通しするだけの関数は、名前が 1 つ増えるぶん読み手が辿る距離を伸ばすだけで、抽象化にはなっていない。

次のどれかに当てはまるラッパーは、呼び出し先を直接呼ぶか、1 つの関数に統合する。

- 引数も戻り値も加工せず、呼び出し先へ委譲しているだけ（`const handleClick = () => onClick();`）
- 戻り値のプロパティを 1 つ取り出しているだけ（`envelope.source` を `sourceForEnvelope(envelope)` にする）
- 受け取った引数の一部を本体が使っていない
- 呼び出し元が 1 箇所しかない
- `undefined` を返す関数と、その直後で `undefined` を潰して throw する関数が対になっている

```ts
// ❌ 悪い例: 取得 → undefined を返す → 隣で throw に変換する、が 3 段に分かれている
export async function findAgentDefinition(name: string, ctx: RunContext) {
  return await FACTORIES.get(name)?.(ctx);
}

async function requireDefinition(name: string, ctx: RunContext) {
  const definition = await findAgentDefinition(name, ctx);
  if (!definition) throw new Error(`no agent definition is registered for '${name}'`);
  return definition;
}

// ✅ 良い例: 取得点で失敗を確定させ、1 関数に集約する
export async function buildAgentDefinition(name: string, ctx: RunContext) {
  const factory = FACTORIES.get(name);
  if (!factory) throw new Error(`no agent definition is registered for '${name}'`);
  return await factory(ctx);
}
```

`undefined` を返す関数を置いてよいのは、呼び出し元がその分岐を実際に使い分けるときだけ。全ての呼び出し元が throw するなら、`undefined` を返す層は要らない。

### 5. コメント

- 複雑なロジックには説明コメントを追加
- JSDocを使用して関数やコンポーネントの説明を記述
- 自明なコードにはコメント不要

```tsx
/**
 * ユーザーの権限をチェックし、アクセス可否を返す
 * @param user - チェック対象のユーザー
 * @param resource - アクセス対象のリソース
 * @returns アクセス可能な場合true
 */
export function checkPermission(user: User, resource: Resource): boolean {
  // 実装
}
```

## まとめ

この規約に従うことで:

- コードの一貫性が保たれる
- チームメンバーがコードを理解しやすくなる
- メンテナンス性が向上する
- バグの混入を防ぎやすくなる

不明点や改良提案がある場合は、チームで議論して規約を更新してください。
