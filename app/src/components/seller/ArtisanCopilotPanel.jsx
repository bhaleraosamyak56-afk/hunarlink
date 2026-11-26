import React, { useRef, useState } from 'react';
import {
  auditCraftListingClaims,
  draftArtisanListingCopilot
} from '../../services/craftproofApi.js';

const SAMPLE_NOTES = [
  {
    label: 'Hinglish Sozni Shawl (Honest)',
    text: 'Main Budgam se hoon, haath se Sozni shawl banaya hai, 45 din lage, pure wool hai, 14500 rupaye chahiye, 3 piece ready hain.'
  },
  {
    label: 'Suspicious Cheap Kani (Test Adversarial Audit)',
    text: '100% pure GI certified handwoven Kani Pashmina shawl, Srinagar se, 90 din lage, price 1550 rupaye, 250 pieces ready stock.'
  }
];

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function ArtisanCopilotPanel({
  clerk,
  currentForm,
  sellerDistrict,
  sellerCraft,
  sellerVerificationPath,
  onApplyDraft
}) {
  const [rawNote, setRawNote] = useState('');
  const [voiceLang, setVoiceLang] = useState('hi-IN');
  const [listening, setListening] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [draftResult, setDraftResult] = useState(null);
  const [auditResult, setAuditResult] = useState(null);
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);

  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  function toggleVoice() {
    if (!speechSupported) return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = voiceLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const spoken = e.results?.[0]?.[0]?.transcript || '';
      if (spoken) {
        setRawNote((prev) => (prev ? `${prev.trim()} ${spoken}` : spoken));
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function handleDraft() {
    if (rawNote.trim().length < 8 || draftLoading) return;
    setDraftLoading(true);
    setError('');
    try {
      const token = clerk ? await clerk.getToken().catch(() => null) : null;
      const res = await draftArtisanListingCopilot(
        {
          raw_note: rawNote.trim(),
          language_hint: voiceLang,
          seller_district: sellerDistrict || null,
          seller_craft_specialty: sellerCraft || null
        },
        token
      );
      setDraftResult(res);
    } catch (err) {
      setError(err?.message || 'Artisan Copilot could not generate draft.');
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleAdversarialAudit() {
    if (auditLoading) return;
    const price = Number(currentForm?.price || draftResult?.draft?.selling_price_inr || 0);
    const title = (currentForm?.title || draftResult?.draft?.title || '').trim();
    if (!title || price <= 0) {
      setError('Enter or draft a product title and selling price before running Adversarial Audit.');
      return;
    }
    setAuditLoading(true);
    setError('');
    try {
      const token = clerk ? await clerk.getToken().catch(() => null) : null;
      const res = await auditCraftListingClaims(
        {
          title,
          description: currentForm?.desc || draftResult?.draft?.clean_description || '',
          craft_technique: currentForm?.technique || draftResult?.draft?.craft_technique || null,
          material_composition: currentForm?.material || draftResult?.draft?.material_composition || null,
          origin_district: currentForm?.origin || draftResult?.draft?.origin_district || null,
          selling_price_inr: price,
          stock_quantity: Number(currentForm?.stock || draftResult?.draft?.stock_quantity || 1),
          craft_days_claimed: draftResult?.draft?.craft_days_estimated || null,
          claimed_gi_code: draftResult?.draft?.claimed_gi_code || null,
          seller_verification_path: sellerVerificationPath || null,
          seller_workshop_district: sellerDistrict || null
        },
        token
      );
      setAuditResult(res);
    } catch (err) {
      setError(err?.message || 'Could not run Adversarial CraftProof Audit.');
    } finally {
      setAuditLoading(false);
    }
  }

  return (
    <div className="cp-card" style={{ marginBottom: 18, borderColor: 'rgba(217, 119, 6, 0.35)', background: '#fffcf6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="cp-kicker">Pillar 2 &middot; Vernacular Voice-to-Passport Artisan Copilot (Local Ollama)</div>
          <h4 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontFamily: 'var(--font-serif, Georgia, serif)' }}>
            Speak or Type in Hindi, Hinglish, or English &mdash; Zero-Hallucination Drafting
          </h4>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#4b5563' }}>
            Describe your craft naturally. Copilot fills the form below, keeps unmentioned GI/fiber fields strictly blank,
            and explains fair handmade pricing to buyers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={voiceLang}
            onChange={(e) => setVoiceLang(e.target.value)}
            aria-label="Voice language"
            style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.78rem' }}
          >
            <option value="hi-IN">Voice: Hindi / Hinglish (hi-IN)</option>
            <option value="en-IN">Voice: English India (en-IN)</option>
          </select>
          {speechSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              className={`cp-btn cp-btn-sm ${listening ? 'cp-btn-danger cp-voice-pulse' : 'cp-btn-saffron'}`}
            >
              {listening ? 'Stop Mic' : '🎤 Speak Craft Note'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0 8px' }}>
        {SAMPLE_NOTES.map((s) => (
          <button
            key={s.label}
            type="button"
            className="cp-btn cp-btn-outline cp-btn-sm"
            onClick={() => setRawNote(s.text)}
          >
            Try: {s.label}
          </button>
        ))}
      </div>

      <textarea
        rows={3}
        value={rawNote}
        onChange={(e) => setRawNote(e.target.value)}
        placeholder="e.g. Main Budgam se hoon, haath se Sozni shawl banaya hai, 45 din lage, pure wool hai, 14500 rupaye chahiye, 3 piece ready hain..."
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid rgba(20,56,42,0.22)',
          fontSize: '0.86rem',
          fontFamily: 'inherit'
        }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="cp-btn cp-btn-primary cp-btn-sm"
          disabled={draftLoading || rawNote.trim().length < 8}
          onClick={handleDraft}
        >
          {draftLoading ? 'Drafting with Local AI…' : 'Draft Listing + Claims'}
        </button>
        <button
          type="button"
          className="cp-btn cp-btn-outline cp-btn-sm"
          disabled={auditLoading}
          onClick={handleAdversarialAudit}
        >
          {auditLoading ? 'Auditing Claims…' : 'Run Adversarial CraftProof Audit'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#b91c1c' }}>{error}</div>
      )}

      {draftResult && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(20,56,42,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="cp-badge cp-badge--SELLER_DECLARED">All Claims Start: SELLER DECLARED</span>
              {draftResult.ai_meta && (
                <span style={{ fontSize: '0.73rem', color: '#6b7280' }}>
                  {draftResult.ai_meta.provider_used} ({draftResult.ai_meta.model_used}, {draftResult.ai_meta.latency_ms}ms)
                </span>
              )}
            </div>
            <button
              type="button"
              className="cp-btn cp-btn-saffron cp-btn-sm"
              onClick={() => onApplyDraft && onApplyDraft(draftResult.draft)}
            >
              Apply Draft to Form Below ↓
            </button>
          </div>

          <div className="cp-grid-2">
            <div style={{ background: '#ffffff', borderRadius: 10, padding: 12, border: '1px solid #e5e7eb' }}>
              <strong style={{ fontSize: '0.82rem', color: '#14382a' }}>Extracted Seller-Declared Claims:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.8rem', lineHeight: 1.55 }}>
                {(draftResult.extracted_claims || []).map((c, idx) => (
                  <li key={idx}>
                    <strong>{c.claim_title}:</strong> {c.claim_value}{' '}
                    <span style={{ color: '#92400e', fontSize: '0.72rem' }}>[{c.status}]</span>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ background: '#fffbeb', borderRadius: 10, padding: 12, border: '1px solid #fde68a' }}>
              <strong style={{ fontSize: '0.82rem', color: '#92400e' }}>
                Intentionally Left Blank (Anti-Hallucination Check):
              </strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.79rem', color: '#78350f', lineHeight: 1.5 }}>
                {(draftResult.missing_fields_to_confirm || []).map((m, idx) => (
                  <li key={idx}>{m}</li>
                ))}
              </ul>
            </div>
          </div>

          {draftResult.fair_craft_breakdown && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', fontSize: '0.8rem', color: '#065f46' }}>
              <strong>Fair-Craft Buyer Explainer:</strong> {draftResult.fair_craft_breakdown.fairness_summary} (Direct to
              artisan: <strong>{draftResult.fair_craft_breakdown.direct_to_artisan_pct}%</strong> &middot; Est. middleman
              markup avoided: <strong>{inr(draftResult.fair_craft_breakdown.middleman_markup_avoided_inr)}</strong>)
            </div>
          )}
        </div>
      )}

      {auditResult && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: auditResult.risk_level === 'HIGH' ? '#fef2f2' : '#f8fafc', border: '1px solid rgba(20,56,42,0.16)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: '0.86rem' }}>Adversarial CraftProof Audit Result:</strong>
            <span className={`cp-badge cp-badge--${auditResult.risk_level}`}>
              Risk: {auditResult.risk_level}
            </span>
            <span className="cp-badge cp-badge--NOT_ESTABLISHED">Advisory Only &middot; Human Verifies</span>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#1f2937' }}>{auditResult.skeptical_assessment}</p>
          {auditResult.red_flags?.length > 0 && (
            <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: '0.8rem', color: '#991b1b' }}>
              {auditResult.red_flags.map((rf, i) => (
                <li key={i}><strong>[{rf.code}]</strong> {rf.message}</li>
              ))}
            </ul>
          )}
          {auditResult.warnings?.length > 0 && (
            <ul style={{ margin: '0 0 6px', paddingLeft: 18, fontSize: '0.79rem', color: '#9a3412' }}>
              {auditResult.warnings.map((w, i) => (
                <li key={i}><strong>[{w.code}]</strong> {w.message}</li>
              ))}
            </ul>
          )}
          <div style={{ fontSize: '0.76rem', color: '#374151' }}>
            Prescribed evidence to earn Human Verification:{' '}
            <strong>{(auditResult.prescribed_evidence_types || []).join(', ')}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
