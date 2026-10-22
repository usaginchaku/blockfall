# Blockfall

ブラウザで遊べる落ちものパズル。キーボード・スマホ操作に対応しています。

公開先: https://usaginchaku.github.io/blockfall/

## 操作

| キー | 操作 |
| --- | --- |
| ← / → | 移動 |
| ↑ / X ・ Z | 右回転 ・ 左回転 |
| ↓ | ソフトドロップ |
| Space | ハードドロップ |
| C / Shift | ホールド |
| P / Esc | 一時停止・再開 |
| Enter | 開始・再挑戦 |

横一列をそろえると消去。10ラインでレベルが上がります。ホールドは設置ごとに1回。ゴーストは着地点の目印です。

ハイスコアとサウンド設定はブラウザに保存します。タブを離れると自動で一時停止します。

## ローカル起動

Python 3 で次を実行し、http://localhost:4173 を開きます。

```sh
python3 -m http.server 4173
```

Node.js と Python 3 があれば `npm run dev` でも起動できます。依存パッケージのインストールは不要です。

## テスト

Node.js 20 以上で実行します。

```sh
npm test
```

## 公開

GitHub の Settings → Pages → Source を **GitHub Actions** に設定します。
`main` への push で、テスト後にゲームの静的ファイルを公開します。
手動実行は Actions → Deploy to GitHub Pages → Run workflow から行えます。
