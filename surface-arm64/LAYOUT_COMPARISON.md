# Surface ARM64 オンライン表示・タッチ比較（検証専用）

このブランチと成果物は実験用です。安定版への反映・PR #2のマージは行いません。

## 基準と保護対象

- 正常版 #79: `dea57e975d94ba2bf51179566b5d8e2d66388f4d`
- 修正版 #80 / PR #2: `c1fff7bff6684ed0880741cf266e6609c192e0ee`
- 検証ブランチ: `surface-arm64-layout-ab-verify`
- `controls.js`、`trickplay-preview.js`、既存オフライン実装、C++ / Qt実装は#79と同一です。
- #80の元の`online-player-layout.js`もそのまま残しています。

## 再現できた主原因

`SurfaceForm.ConnectAsync`はlayout、preview、controlsを一つに連結し、
`AddScriptToExecuteOnDocumentCreatedAsync`で登録します。
文書作成直後には`document.head`と`document.documentElement`の両方がnullになり得ます。
#80の先頭スクリプトは次の式で例外になります。

```js
(document.head || document.documentElement).appendChild(style);
```

Chromiumの文書作成時注入でも実際に両方nullとなり、
`TypeError: Cannot read properties of null (reading 'appendChild')`を再現しました。
その後に連結されたpreviewとcontrolsのコードは実行されず、
`__jfdSurfaceTouchV1`も`__jfdTrickplayPreview`も未設定です。
ブラウザにはタッチイベントが到達しますが、controls側のハンドラーは登録されていません。
この再現時にはCSS自体もDOMへ追加されていませんでした。

これは実機で5操作が一斉に失敗する現象と整合します。
Surface上の直接の確定には、注入無効版での復旧とログの比較が必要です。

## CSS適用先の別問題

#80は再生中に以下の要素と、各要素の全子孫へ
`visibility:hidden!important; pointer-events:none!important`を指定します。

- `.skinBody:not(.mainAnimatedPages)`
- `.mainAnimatedPage:not(#videoOsdPage)`
- `.skinHeader:not(.osdHeader)`

Jellyfin Web 10.11の参照ソースでは、HTML動画のコンテナはbody直下に挿入されます。
React検索のskinBody、mainAnimatedPages内の従来一覧、videoOsdPageは別領域です。
ただし、コンテナ自身だけを除外しても、その祖先が対象なら全子孫指定に巻き込まれます。
検証用に動画をskinBody内へ配置すると、動画はhiddenかつpointer-events:noneとなりました。
controlsのvideo()はcomputed visibilityがhiddenの動画を除外するので、
イベントがwindowへ届いても操作の処理対象が見つからなくなります。
これは追加リスクの再現であり、現在のSurfaceのDOMがこの配置だと確定したものではありません。

参照した上流コミット: `35c0793ece3adbd247eab290ae1effab851f3d37`（release-10.11.z）。

- `src/plugins/htmlVideoPlayer/plugin.js`: bodyへのプレーヤー挿入
- `src/components/AppBody.tsx`: skinBodyとmainAnimatedPages
- `src/controllers/playback/video/index.html`: videoOsdPage

接続先NASの正確なWebビルド・カスタムCSSは未確認です。

## 前回の自動テストで検出できなかった理由

- 表示テストはpage.setContent後のscriptタグから実行し、DOM作成前の注入を再現していませんでした。
- controlsの単体テストと表示用スクリプトのテストが分離され、連結コード全体の停止を検出できませんでした。
- 表示テストはcomputed visibility中心で、5操作のタッチ入力とヒット対象を確認していませんでした。

今回追加したテストはaddInitScriptで連結コードを文書作成直後に実行し、
ブラウザのCDPタッチ入力、elementFromPoint、イベント到達、初期化フラグを確認します。
動画のduration等は再現用にスタブ化しており、コーデックやSurface上のWebView2の試験ではありません。

## 比較用ビルド3種

| mode / 成果物末尾 | 注入するlayout | 目的 |
|---|---|---|
| original | #80のスクリプトをそのまま注入 | #80の失敗再現用 |
| disabled | layoutだけ注入しない | 他の#80変更を残して影響を切り分け |
| dom-ready | CSSを変えず、DOM準備後にstyleを追加 | 最小修正候補。安定版ではない |

disabled版も元スクリプトを同梱しますが、C#の注入文字列へ連結しません。
dom-ready版は別ファイルを選択し、元の#80スクリプトは書き換えません。
ビルド選択はMSBuildの`OnlineLayoutComparison`プロパティで行い、
各ZIPに`comparison.json`でmode・コミット・基準・スクリプトハッシュを記録します。
通常の#79/#80の成果物とは別名でアップロードします。

## ブラウザ比較で確認したこと

| 方式 | 文書作成時例外 | controls初期化 | タッチ操作 |
|---|---|---|---|
| #79と同じ注入 | なし | 成功 | 5操作成功 |
| #80と同じ注入 | appendChildの例外 | 未実行 | ハンドラー未登録。生タッチ到達のみ確認 |
| disabled | なし | 成功 | 5操作成功 |
| dom-ready | なし | 成功 | 5操作成功 |

5操作は左右シーク、ホームへのダブルタップ、左端速度、右端音量、上部全画面です。
ここでの「ホーム」「全画面」はネイティブへのコマンド送信を確認しています。
実際のWinFormsウィンドウ操作・ホーム遷移はSurfaceでの確認対象です。
originalを含むテスト成功は、既知の失敗を期待どおり再現したという意味であり、
originalの実機動作が正常という意味ではありません。

## Surfaceでの比較手順

1. 正常版を上書きせず、各ZIPをoriginal / disabled / dom-readyの別フォルダへ全展開する。
2. 全アプリを終了してから一つずつ起動する。同時起動しない。
   既存の設定・WebProfile・動画は削除しない。この検証版も同じ既存プロファイルを使う。
3. comparison.jsonのmodeを確認し、同じサーバー・アカウント・作品・画面サイズで比較する。
4. まずdisabledで#79の5操作が復旧するか確認する。検索一覧が残ることはこの版の想定内。
5. 続いてdom-readyで5操作が保たれ、検索一覧が動画に重ならないか確認する。
6. 再生開始直後、一時停止後、シーク後、縦横表示、全画面、停止・自然終了・戻る操作を確認する。
7. 女優・作品一覧のスクロール位置、検索語、戻る履歴、字幕・音声選択を確認する。
8. オフライン保存一覧と既存動画を開けることも確認する。データ移行や削除はしない。

既存ログ: `%LOCALAPPDATA%\JellyfinSurfaceARM64\surface.log`
ログを削除せず試験時刻で区切り、`Touch script injected: yes/no`、
`Touch status: script-loaded`、`gesture-start`、`touch-start`を比較する。
イベント名はセッション中に一度だけ記録されるものがあるため、版ごとにアプリを再起動する。
原版でno・無効版でyesかつ操作復旧なら、注入例外の影響を強く裏付ける。
yesなのに操作不能なら、CSS適用先・実際のイベントtargetと動画のcomputed styleを追加調査する。
ログの共有時はこの固定イベント名と試験時刻の抜粋だけで十分です。

## 最小修正の提案と反映条件

第一候補はDOMがない場合だけstyleの追加をDOMContentLoadedへ遅延する変更です。
ジェスチャー計算、イベントリスナー、検索・履歴処理、オフライン処理は変更しません。
CSSの祖先巻き込みが実機で確認された場合は、実際の一覧ルートに対象を限定し、
プレーヤー・OSD・字幕とその祖先へhidden/noneが適用されない構造へ絞り込みます。
その場合もcontrols側を強制変更して回避しません。
初期化失敗が他機能へ波及しないよう注入単位を分ける対策は別途検討できますが、
今回の比較では変数を増やさず、まずstyle追加時期だけを変えています。

自動テストやARM64自己検査の成功を安定性の確定とは扱いません。
Surface実機での比較結果とユーザー承認を得てから、安定版への反映を検討します。
