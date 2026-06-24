/** About — a visual primer on how the pieces fit together: Test Case → Run →
 *  Cycle, and the lifecycle from authoring a test to signing it off. Pure
 *  presentation; no data fetching. */

import { Fragment } from 'react';
import { RUN_STAGES, RUN_STAGE_LABEL } from '../../domain/types';
import type { IconName } from '../../components/Icon';
import { Icon } from '../../components/Icon';

const CONCEPTS: { icon: IconName; name: string; color: string; desc: string }[] = [
  {
    icon: 'file',
    name: 'Test Case',
    color: '#4F9BD9',
    desc: 'One test — a series of steps with expected results. Lives in the Repository, organized in folders by application and functionality.',
  },
  {
    icon: 'play',
    name: 'Run',
    color: '#2E9E6B',
    desc: 'One tester working through a set of test cases, marking each step pass / fail / blocked / nice-to-have, with notes and screenshots.',
  },
  {
    icon: 'package',
    name: 'Cycle',
    color: '#6B4FBF',
    desc: 'A themed group of runs — the same cases run by several testers (or different arms of one effort) — reviewed and signed off once.',
  },
];

export function AboutView() {
  return (
    <div style={{ overflowY: 'auto', padding: '28px 24px' }}>
      <div style={{ maxWidth: 940, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--esp-font-serif)', fontSize: 28, margin: '0 0 6px', color: 'var(--esp-ink)' }}>
          How Bangers &amp; Mash works
        </h1>
        <p className="esp-muted" style={{ marginTop: 0, fontSize: 14, maxWidth: 640 }}>
          Three building blocks and one flow — from authoring a test to signing it off. Here's how they relate.
        </p>

        {/* ---- the three nouns ---- */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            margin: '20px 0 30px',
          }}
        >
          {CONCEPTS.map((c) => (
            <div key={c.name} className="esp-card" style={{ margin: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: 'var(--esp-powder-soft)',
                    color: c.color,
                  }}
                >
                  <Icon name={c.icon} size={16} />
                </span>
                <strong style={{ fontSize: 15.5, color: 'var(--esp-ink)' }}>{c.name}</strong>
              </div>
              <div className="esp-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                {c.desc}
              </div>
            </div>
          ))}
        </div>

        {/* ---- how they nest ---- */}
        <h2 style={{ fontSize: 16, margin: '0 0 4px', color: 'var(--esp-ink)' }}>How they nest</h2>
        <p className="esp-muted" style={{ marginTop: 0, fontSize: 13 }}>
          A <strong>cycle</strong> holds <strong>runs</strong>; each run holds the <strong>test cases</strong> that tester
          works through. Same cases, one run per tester.
        </p>
        <NestDiagram />

        {/* ---- the lifecycle ---- */}
        <h2 style={{ fontSize: 16, margin: '26px 0 4px', color: 'var(--esp-ink)' }}>The lifecycle</h2>
        <p className="esp-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Author in the Repository, then a run or cycle flows left-to-right through QC to a single sign-off.
        </p>
        <LifecycleDiagram />
      </div>
    </div>
  );
}

/** Containment diagram: one Cycle box → three Run boxes → case rows. */
function NestDiagram() {
  const testers = ['Kara', 'Nicole', 'TJ'];
  const cases = ['Create SAT2 contract', 'Apply a deposit', 'Confirm in PBX'];
  return (
    <div
      style={{
        border: '1px solid var(--esp-border)',
        borderRadius: 'var(--esp-radius)',
        background: 'var(--esp-powder-soft)',
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 11, fontSize: 12.5 }}>
        <Icon name="package" size={14} />
        <strong style={{ color: 'var(--esp-ink)', letterSpacing: 0.3 }}>CYCLE</strong>
        <span style={{ color: 'var(--esp-ink)' }}>· Coupa Integration</span>
        <span className="esp-muted">· same cases · 3 testers · one sign-off</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {testers.map((t) => (
          <div
            key={t}
            style={{
              border: '1px solid var(--esp-border)',
              borderRadius: 'var(--esp-radius-sm)',
              background: 'var(--esp-surface)',
              padding: '9px 11px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, marginBottom: 7 }}>
              <Icon name="play" size={11} />
              <strong style={{ color: 'var(--esp-ink)', letterSpacing: 0.3 }}>RUN</strong>
              <span className="esp-muted">· {t}</span>
            </div>
            {cases.map((c) => (
              <div
                key={c}
                style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '3px 0', color: 'var(--esp-muted)' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2E9E6B', flexShrink: 0 }} />
                {c}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lifecycle flow: Repository → start → the four pipeline stages → outputs. */
function LifecycleDiagram() {
  return (
    <div
      style={{
        border: '1px solid var(--esp-border)',
        borderRadius: 'var(--esp-radius)',
        background: 'var(--esp-surface)',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 11px',
            borderRadius: 'var(--esp-radius-sm)',
            background: 'var(--esp-powder-soft)',
            fontSize: 12.5,
            color: 'var(--esp-ink)',
          }}
        >
          <Icon name="folder" size={13} /> Repository
          <span className="esp-muted">· author cases</span>
        </div>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--esp-muted)', fontSize: 11.5 }}>
          <Icon name="arrowRight" size={13} /> start a run / cycle
        </span>

        {RUN_STAGES.map((s, i) => (
          <Fragment key={s}>
            <span className={`esp-stage esp-stage-${s}`}>{RUN_STAGE_LABEL[s]}</span>
            {i < RUN_STAGES.length - 1 ? <Icon name="arrowRight" size={13} /> : null}
          </Fragment>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, fontSize: 12.5 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--esp-muted)' }}>
          <Icon name="flag" size={13} /> A failed step can become a <strong style={{ color: 'var(--esp-ink)', fontWeight: 600 }}>&nbsp;Jira defect</strong>&nbsp;(managers only)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--esp-muted)' }}>
          <Icon name="chart" size={13} /> Everything rolls up to the <strong style={{ color: 'var(--esp-ink)', fontWeight: 600 }}>&nbsp;Dashboard</strong>&nbsp;— filter by cycle, tester, or type
        </span>
      </div>
    </div>
  );
}
