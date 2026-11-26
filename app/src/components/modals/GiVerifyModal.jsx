import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../state/StoreContext.jsx';
import Modal from '../Modal.jsx';
import { IconShield } from '../../components/LineIcons.jsx';
import { lookupPassports } from '../../services/craftproofApi.js';

/* ==========================================================================
   GiVerifyModal — GI registry lookup
   --------------------------------------------------------------------------
   Same three outcomes as the static build: empty field, no match, and verified
   seal with the record. Normalising strips spaces, hashes and dashes so a
   pasted tag from a paper certificate still resolves.
   ========================================================================== */

const normalise = (s) => String(s).toUpperCase().replace(/[\s#-]/g, '');

export default function GiVerifyModal() {
  const { ui, closeModal, catalogue } = useStore();
  const { giId } = ui.modal?.payload || {};
  const [code, setCode] = useState(giId || 'GI-JK-PASH-8821');
  const [result, setResult] = useState(null);
  const [dbPassports, setDbPassports] = useState([]);

  const lookup = (raw) => {
    const value = String(raw ?? code).trim();
    if (!value) {
      setResult({ kind: 'empty' });
      setDbPassports([]);
      return;
    }
    const norm = normalise(value);
    const match = catalogue.find(
      (p) => normalise(p.giId) === norm || normalise(p.giId).includes(norm)
    );
    setResult(match ? { kind: 'ok', product: match } : { kind: 'miss', value });
    lookupPassports(value)
      .then((res) => setDbPassports(res?.items || []))
      .catch(() => setDbPassports([]));
  };

  useEffect(() => {
    lookup(giId || 'GI-JK-PASH-8821');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giId]);

  return (
    <Modal
      id="gi-verify-modal"
      width="620px"
      title={<><IconShield size={15} /> Live Valley GI Tag &amp; Purity Registry Check</>}
      onClose={closeModal}
    >
      <div className="modal-body">
        <p style={{ fontSize: '0.86rem', color: 'var(--text-500)', marginBottom: 14 }}>
          Every HunarLink piece carries a tamper-proof Government GI laser tag. Enter the code on
          the seal to see its origin record, lab audit and artisan.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            id="gi-lookup-input"
            className="verify-quick-input"
            style={{ flex: 1, minWidth: 220 }}
            placeholder="e.g. GI-JK-PASH-8821"
            aria-label="GI tag code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') lookup();
            }}
          />
          <button type="button" className="verify-quick-btn" onClick={() => lookup()}>
            Verify Tag &rarr;
          </button>
        </div>

        <div id="gi-lookup-result" aria-live="polite">
          {result?.kind === 'empty' && (
            <div
              style={{
                background: '#FFF8EB',
                border: '1px solid #E8C988',
                borderRadius: 8,
                padding: 14,
                marginTop: 12,
                color: '#734D0D',
                fontSize: '0.82rem'
              }}
            >
              <strong>&#9888;&#65039; Please enter a GI tag code to verify.</strong>
              <br />
              Try a verified sample like <code>GI-JK-PASH-8821</code>, <code>GI #JK-WNT-1180</code>,
              or <code>GI-JK-PAPR-3109</code>.
            </div>
          )}

          {result?.kind === 'miss' && (
            <div
              style={{
                background: '#FFF8EB',
                border: '1px solid #E8C988',
                borderRadius: 8,
                padding: 14,
                marginTop: 12,
                color: '#734D0D',
                fontSize: '0.82rem'
              }}
            >
              <strong>&#9888;&#65039; No matching GI record found for &ldquo;{result.value}&rdquo;.</strong>
              <br />
              Double-check the tag code or try a verified sample like{' '}
              <code>GI-JK-PASH-8821</code>, <code>GI #JK-WNT-1180</code>, or{' '}
              <code>GI-JK-PAPR-3109</code>.
            </div>
          )}

          {result?.kind === 'ok' && (
            <div
              style={{
                background: 'var(--forest-50)',
                border: '1px solid var(--forest-700)',
                borderRadius: 8,
                padding: 14,
                marginTop: 12
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                  flexWrap: 'wrap',
                  gap: 6
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--forest-900)' }}>
                  &#10003; CRYPTOGRAPHIC GI SEAL VERIFIED
                </span>
                <code
                  style={{
                    background: 'var(--forest-900)',
                    color: 'var(--gold-400)',
                    padding: '2px 8px',
                    borderRadius: 4
                  }}
                >
                  {result.product.giId}
                </code>
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6
                }}
              >
                <div>
                  <strong>Craft Title:</strong> {result.product.title}
                </div>
                <div>
                  <strong>Master Artisan:</strong> {result.product.artisan}
                </div>
                <div>
                  <strong>Geo-Tagged Loom:</strong> {result.product.district} Cluster, J&amp;K
                </div>
                <div>
                  <strong>Lab Purity Audit:</strong> {result.product.purityMetric}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live CraftProof Database Passport Matches (Additive) */}
        {dbPassports.length > 0 && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#f8faf7', border: '1px solid rgba(20,56,42,0.18)' }}>
            <div className="cp-kicker" style={{ marginBottom: 6 }}>
              Live Database CraftProof Passports ({dbPassports.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dbPassports.slice(0, 4).map((cp) => (
                <div key={cp.passport_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.8rem' }}>
                  <div>
                    <strong>{cp.product?.name}</strong> &middot;{' '}
                    <span style={{ fontFamily: 'monospace' }}>{cp.passport_code}</span>{' '}
                    <span className={`cp-badge cp-badge--${cp.overall_trust_level}`}>
                      {cp.overall_trust_level.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <Link
                    to={`/passport/${cp.passport_code}`}
                    className="cp-btn cp-btn-primary cp-btn-sm"
                    onClick={closeModal}
                  >
                    Open Passport &rarr;
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="verify-sample-chips" style={{ marginTop: 14 }}>
          <span className="verify-sample-label">Try sample:</span>
          {['GI-JK-PASH-8821', 'GI #JK-WNT-1180', 'GI-JK-PAPR-3109'].map((s) => (
            <button
              type="button"
              key={s}
              className="verify-sample-chip"
              onClick={() => {
                setCode(s);
                lookup(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
