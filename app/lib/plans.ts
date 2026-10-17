// サイネージ料金プランの初期値（LP の静的表示・検索エンジン用）。実際の価格・申込リンクは管理画面の設定で上書きされる
export type SignagePlan = { id: string; name: string; price: number; interval: string; features: string[]; linkUrl?: string; recommended?: boolean };

export const DEFAULT_PLANS: SignagePlan[] = [
  {
    id: 'lite',
    name: 'ライト',
    price: 1980,
    interval: '月',
    features: ['AIアバターのニュース読み上げ（10ジャンル・自動更新）', 'ローカルニュース（手入力＋キーワード自動収集）', '終わらないニュースクイズ', '専用URL・管理画面']
  },
  {
    id: 'standard',
    name: 'スタンダード',
    price: 3980,
    interval: '月',
    recommended: true,
    features: ['ライトの全機能', 'タッチ／スマホで答えるアンケート（分岐・マトリクス）', '回答特典・抽選クーポン', 'アバターとの音声会話', '回答の集計・CSV出力']
  }
];
