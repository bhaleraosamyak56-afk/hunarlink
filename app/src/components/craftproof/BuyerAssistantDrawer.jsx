import React, { useState } from 'react';
import { askEvidenceLockedBuyerAssistant } from '../../services/craftproofApi.js';

const SUGGESTED_QUESTIONS = [
  'Is this 100% authentic and GI verified?',
  'Which claims have real proof vs seller declarations only?',
  'Why is this craft priced this way?',
  'How can I physically inspect authenticity when it arrives?'
];

export default function BuyerAssistantDrawer({ passportCode, productRef, productName }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  async function handleAsk(customQ) {
    const q = String(customQ ?? question).trim();
    if (q.length < 3 || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await askEvidenceLockedBuyerAssistant({
        passport_code: passportCode || null,
        product_ref: !passportCode ? productRef : null,
        question: q
      });
      setHistory((prev) => [{ question: q, response: res }, ...prev]);
      if (!customQ) setQuestion('');
    } catch (err) {
      setError(err?.message || 'Could not reach CraftProof Buyer Assistant.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="cp-card" style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="cp-kicker">Evidence-Locked AI Assistant (Refuses to Overclaim)</div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'var(--font-serif, Georgia, serif)' }}>
            Ask CraftProof AI About {productName || 'This Craft'}
          </h3>
        </div>
        <span className="cp-badge cp-badge--LOW">Grounded Only in Live DB Passport</span>
      </div>

      <p style={{ fontSize: '0.82rem', color: '#4b5563', margin: '8px 0 12px' }}>
        Unlike sales chatbots, this assistant reads only the live MySQL Craft Passport claims and explicitly
        tells you when a material or GI claim is <strong>Seller Declared</strong> and not yet independently verified.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {SUGGESTED_QUESTIONS.map((sq) => (
          <button
            key={sq}
            type="button"
            className="cp-btn cp-btn-outline cp-btn-sm"
            disabled={loading}
            onClick={() => handleAsk(sq)}
          >
            {sq}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAsk();
        }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about purity, GI status, origin evidence, or how to test at home..."
          style={{
            flex: 1,
            minWidth: 240,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid rgba(20,56,42,0.24)',
            fontSize: '0.88rem'
          }}
        />
        <button type="submit" className="cp-btn cp-btn-primary" disabled={loading || question.trim().length < 3}>
          {loading ? 'Checking Passport...' : 'Ask Honest AI'}
        </button>
      </form>

      {error && (
        <div className="cp-disclaimer-banner" style={{ marginTop: 10, background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {history.map((item, idx) => (
            <div
              key={idx}
              style={{
                border: '1px solid rgba(20,56,42,0.14)',
                borderRadius: 12,
                padding: '12px 14px',
                background: '#faf8f3'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#14382a', marginBottom: 6 }}>
                Q: {item.question}
              </div>
              <div style={{ fontSize: '0.88rem', lineHeight: 1.55, whiteSpace: 'pre-line', color: '#1f2937' }}>
                {item.response.answer}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, fontSize: '0.73rem', color: '#6b7280' }}>
                <span className={`cp-badge cp-badge--${item.response.overall_trust_level}`}>
                  Passport: {item.response.overall_trust_level.replace(/_/g, ' ')}
                </span>
                <span>
                  Verified claims: <strong>{item.response.verified_claims_count}</strong> &middot; Unverified:{' '}
                  <strong>{item.response.unverified_claims_count}</strong>
                </span>
                {item.response.ai_meta && (
                  <span>
                    Engine: <strong>{item.response.ai_meta.provider_used}</strong> ({item.response.ai_meta.model_used},{' '}
                    {item.response.ai_meta.latency_ms}ms)
                  </span>
                )}
                {item.response.overclaim_guard_triggered && (
                  <span className="cp-badge cp-badge--MEDIUM">Anti-Overclaim Guard Active</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
