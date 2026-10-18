// お問い合わせ：/contact（一般の利用者向け。送信先は Formspree）
import type { Metadata } from 'next';
import ContactForm from '../business/ContactForm';
import { SITE_NAME } from '../lib/site';

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: `${SITE_NAME} へのお問い合わせ`,
  alternates: { canonical: '/contact' }
};

const TOPICS = ['サービスについての質問', '不具合のご報告', 'ご意見・ご要望', '個人情報の取り扱い（開示・削除のご請求など）', 'サイネージ導入・法人のご相談', 'その他'];

export default function ContactPage() {
  return (
    <div className="pg-root pg-light">
      <header className="pg-head"><a href="/">🔮 {SITE_NAME}</a></header>
      <main className="pg-main pg-narrow">
        <h1 className="pg-h1">お問い合わせ</h1>
        <p className="pv-lead">ご質問・不具合のご報告・ご意見などは、下のフォームからお送りください。2営業日以内を目安にメールでご返信します。</p>
        <ContactForm topics={TOPICS} source="contact" placeholder="お問い合わせの内容をご記入ください（不具合の場合は、お使いの端末・ブラウザと発生した画面を書いていただけると助かります）" />
      </main>
    </div>
  );
}
