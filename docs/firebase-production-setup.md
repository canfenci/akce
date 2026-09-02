# Akçe Firebase Production Kurulum Kılavuzu

Bu belge, Akçe'nin Firebase Authentication, Cloud Firestore ve PWA yeteneklerinin üretim ortamında eksiksiz ve güvenli bir şekilde yapılandırılması için gerekli adımları içerir.

---

## 1. Firebase Projesi ve Console Ayarları

1. [Firebase Console](https://console.firebase.google.com/) üzerinden yeni bir proje oluşturun veya mevcut projenizi seçin.
2. Projeye bir **Web Uygulaması** ekleyin:
   - Proje Ayarları > Genel > Uygulamalarınız > Web (`</>`) simgesine tıklayın.
   - Uygulama adını belirleyin (örn: `akce-web`).
   - Size verilen yapılandırma parametrelerini `.env` dosyanıza ekleyin.

---

## 2. Çevre Değişkenleri (.env)

Proje kök dizinindeki `.env.example` dosyasını baz alarak `.env` oluşturun:

```bash
VITE_FIREBASE_API_KEY="AIzaSy..."
VITE_FIREBASE_AUTH_DOMAIN="akce-prod.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="akce-prod"
VITE_FIREBASE_STORAGE_BUCKET="akce-prod.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
VITE_FIREBASE_APP_ID="1:123456789:web:abcdef"
```

> **Önemli:** Gerçek gizli anahtarları ve API anahtarlarını Git deposuna commit etmeyin.

---

## 3. Firebase Authentication (Google Sign-In)

1. **Authentication** sekmesine gidin.
2. **Sign-in method** altından **Google** sağlayıcısını etkinleştirin.
   - Destek e-postasını seçin ve kaydedin.
3. **Authorized domains** (Yetkilendirilmiş Alan Adları) listesini yapılandırın:
   - `localhost` (yerel geliştirme ve test için)
   - `127.0.0.1`
   - `your-username.github.io` (GitHub Pages dağıtımı için)
   - Özel alan adınız (varsa, örn: `akce.app`)

---

## 4. Cloud Firestore Veritabanı

1. **Firestore Database** sekmesinden veritabanı oluşturun:
   - Konum olarak kullanıcılarınıza en yakın bölgeyi seçin (örn: `europe-west3` veya `europe-west1`).
   - Güvenlik kuralları başlangıç modunda "Üretim modu"nu seçin.

---

## 5. Firestore Security Rules Dağıtımı

Depoda yer alan [`firestore.rules`](../firestore.rules) dosyası, kullanıcının yalnızca kendi verilerine erişebilmesini (`users/{uid}/**`) ve katı veri tipi / negatif tutar doğrulamalarını sağlar.

Kuralları Firebase CLI ile deploy etmek için:

```bash
# Firebase CLI ile giriş yapın
firebase login

# Aktif projeyi seçin
firebase use <PROJE_ID>

# Yalnızca Firestore kurallarını deploy edin
firebase deploy --only firestore:rules
```

---

## 6. Yerel Emulator Kullanımı

Geliştirme ve kural testleri için Firebase Local Emulator Suite kullanılabilir:

```bash
# Emulator'ı başlatın (Firestore: port 8080)
firebase emulators:start --only firestore
```

`firebase.json` içinde emulator portları tanımlıdır:
- Firestore: `8080`

---

## 7. Cihaz Güvenliği ve Önbellek Tercihi (Trusted Device)

Akçe, kullanıcı gizliliğini korumak amacıyla cihaz bazlı önbellekleme desteği sunar:
- **Kişisel Cihaz (Güvenilir)**: Firestore `persistentLocalCache` ve `persistentMultipleTabManager` kullanılarak IndexedDB üzerinde kalıcı önbellek tutulur. PWA yeniden açıldığında anında açılır ve çok sekmeli çalışma güvenceye alınır.
- **Ortak / Paylaşılan Cihaz**: Firestore `memoryLocalCache` kullanılarak finansal kayıtlar diskte saklanmaz; oturum kapandığında veya sekme yenilendiğinde bellek temizlenir.

Kullanıcı bu tercihi uygulama içerisindeki **Ayarlar > Cihaz türü** menüsünden dilediği an değiştirebilir.
