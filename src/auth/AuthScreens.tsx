import { useAuth } from './AuthProvider';

export function AuthLoadingScreen() {
  return <main className="auth-screen" aria-live="polite"><div className="auth-card"><div className="auth-wordmark">akçe<span>.</span></div><span className="auth-loader" aria-hidden="true" /><p>Güvenli oturumun hazırlanıyor…</p></div></main>;
}

export function SignedOutScreen() {
  const { error, signInWithGoogle, continueLocally } = useAuth();
  return <main className="auth-screen"><section className="auth-card"><div className="auth-wordmark">akçe<span>.</span></div><div><span className="eyebrow">FİNANSAL DİSİPLİN</span><h1>Finansal disiplinin, tüm cihazlarında yanında.</h1><p>Google hesabınla devam et veya verilerini yalnızca bu cihazda tut.</p></div>{error && <div className="auth-error" role="alert">{error}</div>}<div className="auth-actions"><button className="auth-google" onClick={() => void signInWithGoogle()}><span aria-hidden="true">G</span>Google ile devam et</button><button className="auth-local" onClick={continueLocally}>Bu cihazda kullan</button></div><small>Google hesabınla giriş yaptığında verilerin cihazların arasında eşitlenir.</small></section></main>;
}
