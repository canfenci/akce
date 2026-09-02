# Firebase Authentication kurulumu

Akçe, Firebase modular SDK ile yalnız Google Authentication kullanır. Firestore ve bulut senkronizasyonu bu fazın kapsamında değildir.

## Firebase Console

1. Firebase projesinde bir Web App oluşturun.
2. Authentication > Sign-in method bölümünde Google sağlayıcısını etkinleştirin ve destek e-postasını seçin.
3. Authentication > Settings > Authorized domains bölümüne geliştirme için `localhost`, GitHub Pages için `canfenci.github.io` ekleyin. Bu alana `/akce/` yolu değil, yalnız hostname yazılır.
4. Web App yapılandırmasındaki değerleri `.env.example` dosyasını temel alan, commit edilmeyen `.env.local` dosyasına girin.

GitHub Pages build'i CI üzerinde alınıyorsa aynı altı `VITE_FIREBASE_*` değeri build job'ına repository/environment variable veya secret olarak verilmelidir. Bunlar Vite tarafından build sırasında istemci paketine yerleştirilir; `.env.local` yalnız yerel geliştirme içindir.

GitHub Pages uygulama adresi `https://canfenci.github.io/akce/` olarak kalır. Vite üretim base path'i `/akce/` değerindedir. Firebase SDK redirect akışından dönerken mevcut sayfa URL'sini korur; Firebase Console'daki authorized domain kaydı bunun hostname kısmını kapsamalıdır.

## GitHub Pages redirect notu

Mobil ve kurulu PWA akışı `signInWithRedirect`, masaüstü tarayıcı akışı `signInWithPopup` kullanır. GitHub Pages, Firebase Hosting dışındaki statik bir host olduğu için bazı tarayıcıların üçüncü taraf depolama kısıtlamaları redirect sonucunu engelleyebilir. Firebase'in resmi çözüm seçeneklerinden reverse proxy GitHub Pages üzerinde uygulanamaz. Böyle bir tarayıcı sorunu görülürse sonraki dağıtım fazında Firebase Hosting/custom domain veya bağımsız Google OAuth credential akışı değerlendirilmelidir.

Kaynaklar:

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/auth-state-persistence
- https://firebase.google.com/docs/auth/web/redirect-best-practices
