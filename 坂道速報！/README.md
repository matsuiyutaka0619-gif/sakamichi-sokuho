# 坂道速報！

乃木坂46・櫻坂46・日向坂46とOGのニュースを、RSSから自動収集して表示する静的サイトです。

## 使い方

ローカル確認:

```bash
npm run serve
```

ブラウザで `http://localhost:4173` を開きます。

RSSを手動更新:

```bash
npm run update:feeds
```

## 編集する場所

- RSSを追加・停止する: `data/rss-sources.json`
- キーワードを直す: `data/keywords.json`
- メンバー辞書を直す: `data/members.json`
- AdSenseのads.txtを入れる: `ads.txt`

## GitHub Pages公開

GitHubのリポジトリ設定で、Pagesの公開元を `main` ブランチのルートにします。

GitHub Actionsは6時間ごとにRSSを取得し、坂道関連の記事だけを `data/articles.json` に保存します。

## 注意

Yahoo!ニュースRSSは公開サイトでの利用が許可されていないため、初期設定では無効化しています。

記事本文は転載せず、タイトル・概要・元記事リンクだけを表示します。
