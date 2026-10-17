// サイネージ事業向けのランディングページ：/business
// 検索エンジン向けにサーバーで描画し、料金と申込リンクだけ PlanCards（クライアント）で最新化する

import type { Metadata } from 'next';
import PlanCards from './PlanCards';
import { DEFAULT_PLANS } from '../lib/plans';
import { SITE_NAME, SITE_URL } from '../lib/site';

const TITLE = 'サイネージ向けAIアバターコンテンツ｜月額1,980円からニュース・アンケート・クイズ';
const DESC =
  'お手持ちのデジタルサイネージに、話すAIアバターを。最新ニュースと地域の話題を自動で読み上げ、タッチやスマホで答えるアンケート（回答特典・抽選つき）、終わらないニュースクイズで足を止めます。専用機器不要、URLを開くだけ。1画面 月額1,980円から。';

export const metadata: Metadata = {
  title: { absolute: `${TITLE}｜${SITE_NAME}` },
  description: DESC,
  keywords: ['デジタルサイネージ', 'サイネージ コンテンツ', 'サイネージ ニュース配信', 'AIアバター', 'タッチパネル アンケート', '店舗 アンケート 抽選', '自治体 観光 サイネージ', 'インタラクティブサイネージ'],
  alternates: { canonical: '/business' },
  openGraph: { url: '/business', title: TITLE, description: DESC, images: [{ url: '/og-business.png', width: 1200, height: 630, alt: TITLE }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC, images: ['/og-business.png'] }
};

const FAQ = [
  { q: '専用の機器は必要ですか？', a: '必要ありません。Chromeなどのブラウザが動くサイネージ・スマートTV・タブレット・PCなら、発行されたURLを開くだけで表示されます。' },
  { q: 'タッチできない画面でも使えますか？', a: '使えます。設定で「タッチ操作なし」にすると、アンケートやクイズはQRコードからお客様のスマホで参加する表示に自動で切り替わり、画面には回答状況やランキングが表示されます。' },
  { q: '表示内容はあとから変えられますか？', a: '専用の設定画面から、ローカルニュースの追加、自動収集キーワード、アンケートの作成、表示モード（ニュース／アンケート／クイズ／ミックス）をいつでも変更でき、約1分でサイネージに反映されます。' },
  { q: 'ニュースはどこから配信されますか？', a: '各メディアが公式に配信しているRSSをもとに、AIが要約して読み上げます。出典を必ず表示し、AIでの利用を拒否しているメディアは本文を取得せず、配信元の概要のみを使います。' },
  { q: 'アンケートの回答特典はどう渡しますか？', a: '全員へのクーポンコード表示、またはその場で当たり・はずれが出る抽選が選べます。当選者には引換番号が表示され、設定画面で本物か・使用済みかを確認できます。' },
  { q: '支払い方法と契約期間は？', a: '初期費用0円、月単位のご契約です。お申し込みフォームから送信いただき、銀行振込（請求書払い）でお支払いください。ご入金を確認後に専用URLをお送りします。まとめてのお支払い（3ヶ月・12ヶ月）や解約はいつでもご相談いただけます。' }
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Product',
      name: `${SITE_NAME} for Signage`,
      description: DESC,
      image: `${SITE_URL}/og-business.png`,
      brand: { '@type': 'Brand', name: SITE_NAME },
      offers: DEFAULT_PLANS.map(p => ({
        '@type': 'Offer',
        name: `${p.name}プラン`,
        price: p.price,
        priceCurrency: 'JPY',
        availability: 'https://schema.org/InStock',
        url: `${SITE_URL}/business#pricing`,
        priceSpecification: { '@type': 'UnitPriceSpecification', price: p.price, priceCurrency: 'JPY', unitText: '月・1画面' }
      }))
    },
    { '@type': 'FAQPage', mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'サイネージ向けサービス', item: `${SITE_URL}/business` }
      ]
    }
  ]
};

export default function BusinessPage() {
  return (
    <div className="lp-root">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="lp-head">
        <a href="/" className="lp-logo">🔮 {SITE_NAME} <small>for Signage</small></a>
        <nav>
          <a href="#features">できること</a>
          <a href="#usecases">導入例</a>
          <a href="#pricing">料金</a>
          <a href="#faq">よくある質問</a>
          <a className="lp-head-cta" href="#pricing">申し込む</a>
        </nav>
      </header>

      <main>
        <section className="lp-hero">
          <div>
            <p className="lp-kicker">店舗・施設・自治体のデジタルサイネージに</p>
            <h1>サイネージに、<br /><em>話しかけられる</em>AIアバターを。</h1>
            <p className="lp-lead">ニュースと地域の話題を声で読み上げ、アンケートとクイズで「見るだけ」の画面を「参加する」画面に。専用機器なし、URLを開くだけで今日から始められます。</p>
            <div className="lp-hero-cta">
              <a className="lp-cta" href="#pricing">月額1,980円から始める</a>
              <a className="lp-cta lp-cta-sub" href="/signage" target="_blank" rel="noreferrer">デモを見る</a>
            </div>
            <ul className="lp-points"><li>初期費用0円</li><li>月単位でいつでも解約</li><li>タッチなし画面にも対応</li></ul>
          </div>
          <div className="lp-hero-visual" aria-hidden="true">
            <div className="lp-screen">
              <div className="lp-bubble"><small>ローカルニュース</small><b>駅前広場で秋のマルシェ開催</b><span>今週末、地元の農家さんの野菜や…</span></div>
              <div className="lp-avatar">🤖</div>
              <div className="lp-qr">QR<br /><small>スマホで回答</small></div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="problem">
          <h2>そのサイネージ、立ち止まって見られていますか？</h2>
          <div className="lp-grid3">
            <div className="lp-card"><b>😶 同じ動画の繰り返し</b><p>更新の手間がかかり、いつ見ても同じ内容に。</p></div>
            <div className="lp-card"><b>📉 効果がわからない</b><p>どれだけ見られたか、お客様の声が集まらない。</p></div>
            <div className="lp-card"><b>💸 コンテンツ制作が高い</b><p>ニュースや天気の配信、アンケートの仕組みは別料金。</p></div>
          </div>
        </section>

        <section className="lp-section" id="features">
          <h2>{SITE_NAME} ができること</h2>
          <div className="lp-features">
            <article><span>🎙</span><h3>ニュースを毎日自動で読み上げ</h3><p>10ジャンルの最新ニュースをAIが要約し、3Dアバターが声と吹き出しで伝えます。更新作業はゼロ。</p></article>
            <article><span>📍</span><h3>ローカルニュース</h3><p>お店のお知らせや地域の話題を手入力で。地名などのキーワードを登録すれば、関連ニュースを自動で集めます。</p></article>
            <article><span>📝</span><h3>タッチで答えるアンケート</h3><p>選択・複数選択・満足度・マトリクス、条件分岐にも対応。回答はリアルタイムで集計しCSVで出力。</p></article>
            <article><span>🎁</span><h3>回答特典・その場で抽選</h3><p>クーポン配布や当たり付き抽選で回答率アップ。当選番号は設定画面で引換確認できます。</p></article>
            <article><span>🎮</span><h3>終わらないニュースクイズ</h3><p>その日のニュースから毎日自動出題。レベル・連続正解ボーナス・今日のランキングで何度も遊べます。</p></article>
            <article><span>💬</span><h3>アバターと音声で会話</h3><p>「おすすめは？」「この言葉って？」に声で答えます。地域情報や掲載中の商品についても案内。</p></article>
            <article><span>📱</span><h3>タッチできない画面にも</h3><p>QRコードからお客様のスマホで参加。画面には「みんなの回答」やランキングが表示されます。</p></article>
            <article><span>⚡</span><h3>すぐに切り替え</h3><p>ニュース／アンケート／クイズ／ミックスを設定画面から変更。約1分でサイネージに反映されます。</p></article>
          </div>
        </section>

        <section className="lp-section" id="usecases">
          <h2>導入例</h2>
          <div className="lp-grid3">
            <div className="lp-card"><b>☕ カフェ・飲食店</b><p>待ち時間にニュースとクイズ。満足度アンケートに答えると次回使えるクーポン。</p></div>
            <div className="lp-card"><b>🏛 自治体・観光案内所</b><p>地域ニュースと観光情報をアバターが案内。来訪者アンケートで施策の声を集めます。</p></div>
            <div className="lp-card"><b>🏥 クリニック・待合室</b><p>音量を抑えて吹き出し中心の表示に。暮らし・健康のニュースで待ち時間を快適に。</p></div>
            <div className="lp-card"><b>🏬 商業施設・イベント</b><p>抽選付きアンケートで来場者データを取得。スポンサー商品の3D表示にも対応。</p></div>
            <div className="lp-card"><b>🏢 オフィス・社内</b><p>社内のお知らせをローカルニュースとして配信。社内アンケートもその場で。</p></div>
            <div className="lp-card"><b>🏫 学校・図書館</b><p>ニュースクイズで時事に親しむきっかけに。今日のランキングで盛り上がります。</p></div>
          </div>
        </section>

        <section className="lp-section" id="steps">
          <h2>はじめ方は3ステップ</h2>
          <ol className="lp-steps">
            <li><b>プランを選んで申し込む</b><span>フォームを送信して、お振込み。</span></li>
            <li><b>専用URLが届く</b><span>ご入金を確認後、サイネージ用のURLと設定画面のURLをメールでお送りします。</span></li>
            <li><b>サイネージでURLを開く</b><span>すぐに表示開始。内容は設定画面からいつでも変更。</span></li>
          </ol>
        </section>

        <section className="lp-section" id="pricing">
          <h2>料金</h2>
          <p className="lp-sub">一般的なサイネージ向けコンテンツ配信と比べても手頃な、1画面あたりの月額制です。</p>
          <PlanCards />
        </section>

        <section className="lp-section" id="faq">
          <h2>よくある質問</h2>
          <div className="lp-faq">
            {FAQ.map(f => (
              <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
            ))}
          </div>
        </section>

        <section className="lp-final">
          <h2>今日から、話しかけたくなるサイネージに。</h2>
          <a className="lp-cta" href="#pricing">プランを選ぶ</a>
        </section>
      </main>

      <footer className="lp-foot">
        <a href="/">{SITE_NAME}（一般向け）</a>
        <a href="/play">ニュースクイズ</a>
        <span>© {new Date().getFullYear()} {SITE_NAME}</span>
      </footer>
    </div>
  );
}
