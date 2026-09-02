# Firestore finance repository

`FirebaseFinanceRepository`, mevcut `FinanceRepository` abstraction'ının realtime implementasyonudur. Auth ve finance reducer katmanları Firebase ayrıntılarını bilmez.

## Veri yolları

- `users/{uid}`
- `users/{uid}/months/{monthKey}`
- `users/{uid}/months/{monthKey}/{expenses|incomes|fixedExpenses|investments|categoryBudgets}/{documentId}`
- `users/{uid}/{assets|goals|assetSnapshots}/{documentId}`

Repository yalnız seçili ayın beş koleksiyonunu dinler. Assets, goals ve assetSnapshots ayrı global listener grubudur. Her subscription kendi cleanup fonksiyonunu döndürür; `dispose()` kalan tüm listener'ları kapatır.

## Aktivasyon sınırı

Bu faz repository, mapper, mutation ve cache initialization altyapısını sağlar; uygulama store'unun veri otoritesini henüz Firestore'a geçirmez. Böylece giriş yapan kullanıcının mevcut local verisi otomatik yüklenmez, buluta yazılmaz veya boş cloud state tarafından ezilmez. Repository seçimi ve local-to-cloud migration AKÇE-008C kapsamındadır.

Firestore varsayılan olarak memory cache ile initialize edilir. Güvenilir cihaz tercihi sonraki fazda alındığında factory `cacheMode: 'persistent'` ile `persistentLocalCache` ve multi-tab yönetimini etkinleştirebilir.
