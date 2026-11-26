import React, { useState } from 'react';
import { uploadGuardrailDocument } from '../../services/apiClient.js';
import { prescreenArtisanDocument } from '../../services/craftproofApi.js';

/* ==========================================================================
   DocPreScreenCard — Pillar 1A (Artisan Verify Page `/auth?tab=verify`)
   --------------------------------------------------------------------------
   Strictly additive AI Pre-Screen widget triggered when an artisan uploads
   their GI Certificate or Standard Artisan Card. Runs local PDF/OCR extraction
   + Ollama advisory cross-check and passes findings to Admin — NEVER approves!
   ========================================================================== */

export default function DocPreScreenCard({
  clerk,
  cardFile,
  giMode,
  form,
  applicationId = null,
  onPreScreenComplete = null
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function runPreCheck() {
    if (running) return;
    setRunning(true);
    setError('');
    try {
      const token = clerk ? await clerk.getToken() : null;
      if (!token) {
        throw new Error('Please sign in with your artisan account before running AI document pre-check.');
      }

      let scanId = null;
      if (cardFile) {
        const scope = giMode === 'with_gi' ? 'gi_certificate' : 'artisan_card';
        const uploaded = await uploadGuardrailDocument(cardFile, scope, token);
        scanId = uploaded.scan_id;
      }

      const dossier = await prescreenArtisanDocument(
        {
          file_scan_id: scanId,
          application_id: applicationId || null,
          store_name: (form.storeName || 'Artisan Workshop').trim(),
          craft_specialty: form.craft || 'Kashmir Pashmina',
          workshop_district: form.district || 'Srinagar',
          verification_path: giMode === 'with_gi' ? 'GI' : 'NON_GI',
          claimed_gi_code: giMode === 'with_gi' ? (form.giId || '').trim() || null : null
        },
        token
      );
      setResult(dossier);
      if (onPreScreenComplete) onPreScreenComplete(dossier, scanId);
    } catch (err) {
      setError(err?.message || 'AI document pre-check could not run right now.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 14,
        padding: '14px 16px',
        borderRadius: 12,
        background: '#f8faf7',
        border: '1px solid rgba(20, 56, 42, 0.18)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="cp-kicker" style={{ marginBottom: 2 }}>
            CraftProof AI Pre-Screen (Local Advisory — Admin Reviews Manually)
          </div>
          <div style={{ fontSize: '0.82rem', color: '#374151' }}>
            Pre-check your uploaded {giMode === 'with_gi' ? 'GI Certificate' : 'Artisan Card'} for
            mismatches before submitting to Human Admin review.
          </div>
        </div>
        <button
          type="button"
          className="cp-btn cp-btn-outline cp-btn-sm"
          disabled={running || !form.storeName?.trim()}
          onClick={runPreCheck}
        >
          {running ? 'Scanning Document…' : 'Run AI Pre-Check'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#b91c1c' }}>{error}</div>
      )}

      {result && (
        <div style={{ marginTop: 12, borderTop: '1px solid rgba(20,56,42,0.12)', paddingTop: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span className={`cp-badge cp-badge--${result.advisory_status}`}>
              {result.advisory_status.replace(/_/g, ' ')}
            </span>
            <span className="cp-badge cp-badge--NOT_ESTABLISHED">
              Not Legal Proof &middot; Human Admin Decides
            </span>
            {result.ai_meta && (
              <span style={{ fontSize: '0.73rem', color: '#6b7280' }}>
                {result.ai_meta.provider_used} ({result.ai_meta.model_used})
              </span>
            )}
          </div>

          <p style={{ margin: '0 0 8px', fontSize: '0.83rem', color: '#1f2937' }}>
            {result.advisory_summary}
          </p>

          {result.contradictions?.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
              <strong style={{ fontSize: '0.78rem', color: '#991b1b' }}>Flags to fix or clarify for Admin:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: '0.78rem', color: '#7f1d1d' }}>
                {result.contradictions.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          {result.checks_passed?.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: '0.77rem', color: '#166534' }}>
              {result.checks_passed.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
