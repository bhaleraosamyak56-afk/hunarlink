import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchSellerClusterOffers,
  respondSellerClusterOffer
} from '../../services/craftproofApi.js';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function ClusterOffersPanel({ clerk, toast }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const loadOffers = useCallback(async () => {
    if (!clerk) return;
    setLoading(true);
    try {
      const token = await clerk.getToken();
      if (!token) return;
      const res = await fetchSellerClusterOffers(token);
      setOffers(res.items || []);
    } catch {
      // silent if backend offline
    } finally {
      setLoading(false);
    }
  }, [clerk]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  async function handleRespond(matchId, decision) {
    setBusyId(matchId);
    try {
      const token = await clerk.getToken();
      await respondSellerClusterOffer(
        matchId,
        {
          decision,
          response_note:
            decision === 'ACCEPTED'
              ? 'Workshop confirmed capacity and raw material availability for this cluster batch.'
              : 'Workshop currently booked for this delivery window.'
        },
        token
      );
      if (toast) toast(`Bulk/Cluster offer ${decision.toLowerCase()}!`, 'success');
      await loadOffers();
    } catch (err) {
      if (toast) toast(err?.message || 'Could not update offer.', 'error');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="section-card" style={{ marginBottom: 18 }}>
      <div className="section-card-head">
        <div>
          <h3 className="section-card-title">Demand Bridge &mdash; Incoming Bulk &amp; Cluster Allocations</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-500)', margin: '2px 0 0' }}>
            Direct corporate &amp; boutique orders matched deterministically to your workshop capacity (0% broker cut).
          </p>
        </div>
        <button type="button" className="cp-btn cp-btn-outline cp-btn-sm" onClick={loadOffers} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: '0.84rem', opacity: 0.7 }}>Checking live Demand Bridge offers…</p>
      ) : offers.length === 0 ? (
        <p style={{ fontSize: '0.84rem', opacity: 0.75 }}>
          No Demand Bridge bulk or multi-artisan cluster allocations assigned yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {offers.map((o) => (
            <div key={o.match_id} className="cp-claim-item cp-claim-item--verified">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{o.buyer_name}</strong> &middot; Brief <span style={{ fontFamily: 'monospace' }}>{o.request_code}</span>
                  {o.is_cluster_member && (
                    <span className="cp-badge cp-badge--HUMAN_VERIFIED" style={{ marginLeft: 8 }}>
                      Multi-Artisan Cluster Share: {o.allocated_quantity} / {o.total_order_quantity} units
                    </span>
                  )}
                </div>
                <span className={`cp-badge cp-badge--${o.match_status === 'ACCEPTED' ? 'HUMAN_VERIFIED' : o.match_status === 'DECLINED' ? 'REJECTED' : 'EVIDENCE_SUBMITTED'}`}>
                  {o.match_status}
                </span>
              </div>

              <p style={{ margin: '6px 0', fontSize: '0.83rem', color: '#374151' }}>{o.raw_request_text}</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: '0.78rem', color: '#4b5563' }}>
                  Est. Rate: <strong>{o.estimated_unit_price_inr ? inr(o.estimated_unit_price_inr) : 'Quote'}</strong>/unit &middot;
                  Target Lead: <strong>{o.estimated_lead_days} days</strong> &middot; Match Score: <strong>{o.match_score}/100</strong>
                </span>
                {o.match_status === 'CONTACTED' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="cp-btn cp-btn-primary cp-btn-sm"
                      disabled={busyId === o.match_id}
                      onClick={() => handleRespond(o.match_id, 'ACCEPTED')}
                    >
                      Accept Allocation
                    </button>
                    <button
                      type="button"
                      className="cp-btn cp-btn-outline cp-btn-sm"
                      disabled={busyId === o.match_id}
                      onClick={() => handleRespond(o.match_id, 'DECLINED')}
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
