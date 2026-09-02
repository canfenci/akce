function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: '#1a4731', fontSize: '2rem', marginBottom: '8px' }}>AKÇE</h1>
      <p style={{ color: '#666', fontSize: '1rem' }}>Finansal Disiplin ve Özgürlük</p>
      
      <div style={{ marginTop: '40px', padding: '20px', background: '#f5f5f0', borderRadius: '12px' }}>
        <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '8px' }}>BUGÜN GÜVENLE HARCAYABİLECEĞİN</p>
        <p style={{ fontSize: '2.5rem', fontWeight: '700', color: '#1a4731', margin: '0' }}>1.824 TL</p>
        <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '12px' }}>
          Kalan serbest bütçe: 52.905 TL<br />
          Ay sonuna: 29 gün
        </p>
      </div>

      <div style={{ marginTop: '24px', padding: '16px', background: '#fff9e6', borderRadius: '8px', borderLeft: '4px solid #d4af37' }}>
        <p style={{ fontSize: '0.875rem', color: '#333', margin: 0 }}>
          "Önce geleceğini finanse et, sonra bugünü harca."
        </p>
      </div>

      <div style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#1a4731', marginBottom: '16px' }}>Hedefler</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.875rem', color: '#333' }}>TEFAS</span>
            <span style={{ fontSize: '0.875rem', color: '#333' }}>132.000 / 200.000 TL</span>
          </div>
          <div style={{ height: '8px', background: '#e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: '66%', height: '100%', background: '#d4af37' }}></div>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>Kalan: 68.000 TL</p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.875rem', color: '#333' }}>Nasdaq</span>
            <span style={{ fontSize: '0.875rem', color: '#333' }}>185.000 / 250.000 TL</span>
          </div>
          <div style={{ height: '8px', background: '#e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: '74%', height: '100%', background: '#d4af37' }}></div>
          </div>
        </div>

        <div style={{ marginTop: '32px', padding: '20px', background: '#1a4731', borderRadius: '12px', color: '#fff' }}>
          <p style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '8px' }}>Toplam Finansal Varlık</p>
          <p style={{ fontSize: '2rem', fontWeight: '700', margin: 0 }}>447.000 TL</p>
          <p style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '8px' }}>Hedef: 1.000.000 TL (%44,7)</p>
        </div>
      </div>
    </div>
  );
}

export default App;
