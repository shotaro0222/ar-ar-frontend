// 管理者のログイン状態（パスワード＝ADMIN_TOKEN）
// localStorage に保存するので、別タブで開くサイネージのプレビューでも使える
const KEY = 'ns-admin-session';

export const getAdminSession = (): string => {
  try { return localStorage.getItem(KEY) || sessionStorage.getItem('ns-admin') || ''; } catch { return ''; }
};
export const setAdminSession = (t: string) => { try { localStorage.setItem(KEY, t); } catch { /* noop */ } };
export const clearAdminSession = () => {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem('ns-admin'); } catch { /* noop */ }
};
