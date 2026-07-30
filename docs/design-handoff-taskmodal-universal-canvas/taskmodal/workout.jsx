/* ============================================================================
   TaskModal — Workout (parametric blocks) + Workout log (recorded results).
   Mirrors the block-blueprint architecture: each exercise-shaped block carries
   a `block_format` + `format_params`; instruction-only blocks are exempt.
   ============================================================================ */

const FMT_ACCENT = [
  'amrap',
  'emom',
  'tabata',
  'superset',
  'circuit',
  'ladder',
  'chipper',
  'pyramid',
  'contrast',
  'clusters',
  'drop_sets',
];

function WorkoutStats({ rec }) {
  const tiles = [
    { k: 'Type', v: rec.workout_type || '—' },
    { k: 'Duration', v: rec.duration_min || '—', u: rec.duration_min ? 'min' : '' },
    { k: 'Target', v: rec.target_rpe ? 'RPE ' + rec.target_rpe : '—' },
  ];
  return (
    <div className="tm-stats">
      {tiles.map((t) => (
        <div className="tm-stat-tile" key={t.k}>
          <div className="tm-stat-v">
            {t.v}
            {t.u && <span className="u">{t.u}</span>}
          </div>
          <div className="tm-stat-k">{t.k}</div>
        </div>
      ))}
    </div>
  );
}

function ExerciseRow({ ex, i }) {
  const stats = [];
  if (ex.sets) stats.push({ k: 'sets', v: ex.sets });
  if (ex.reps) stats.push({ k: 'reps', v: ex.reps });
  if (ex.rpe) stats.push({ k: 'rpe', v: ex.rpe });
  if (ex.rest_seconds) stats.push({ k: 'rest', v: ex.rest_seconds + 's' });
  return (
    <div className="tm-ex">
      <span className="tm-ex-idx">{i + 1}</span>
      <div className="tm-ex-main">
        <div className="tm-ex-name">{ex.name}</div>
        {ex.note && <div className="tm-ex-note">{ex.note}</div>}
      </div>
      <div className="tm-ex-meta">
        {stats.map((s) => (
          <div className="tm-ex-stat" key={s.k}>
            <div className="v">{s.v}</div>
            <div className="k">{s.k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkoutBlock({ block }) {
  const sub = window.TM.blockSubtitle(block);
  const isInstr = !block.block_format && block.instructions;
  const fmtLabel = block.block_format ? block.block_format.replace(/_/g, ' ') : null;
  const accent = block.block_format && FMT_ACCENT.includes(block.block_format);
  return (
    <div className="tm-block">
      <div className="tm-block-head">
        <span className="tm-block-grip">
          <Icon name="GripVertical" size={15} stroke={2} />
        </span>
        <span className="tm-block-name">{block.name}</span>
        {fmtLabel ? (
          <span className={cx('tm-block-fmt', !accent && 'neutral')}>{fmtLabel}</span>
        ) : (
          <span className="tm-block-fmt neutral">prep</span>
        )}
        {sub && <span className="tm-block-sub">{sub}</span>}
        <div className="tm-block-actions">
          <button className="tm-iconbtn" title="Edit block">
            <Icon name="Pencil" size={14} stroke={2} />
          </button>
        </div>
      </div>
      <div className="tm-block-body">
        {isInstr
          ? block.instructions.map((t, i) => (
              <div className="tm-instr" key={i}>
                <span className="tm-instr-dot" />
                {t}
              </div>
            ))
          : (block.exercises || []).map((ex, i) => <ExerciseRow ex={ex} i={i} key={i} />)}
      </div>
    </div>
  );
}

function WorkoutBlocks({ rec }) {
  if (!rec.blocks || rec.blocks.length === 0) {
    return (
      <div className="tm-block" style={{ borderStyle: 'dashed', background: 'transparent' }}>
        <div style={{ padding: '22px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
            No blocks yet. Ask the <b style={{ color: 'var(--foreground)' }}>Coach</b> in chat to
            build the workout — it selects a format from the blueprint library and hydrates the
            exercises.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      {rec.blocks.map((b, i) => (
        <WorkoutBlock block={b} key={i} />
      ))}
      <button
        className="tm-btn tm-btn-ghost tm-btn-block"
        style={{ borderColor: 'var(--border)', borderStyle: 'dashed', height: 42 }}
      >
        <Icon name="Plus" size={15} stroke={2.4} /> Add block
      </button>
    </div>
  );
}

/* --- Workout log: recorded results -------------------------------------- */
function LogResults({ rec }) {
  if (!rec.log || rec.log.length === 0) {
    return (
      <div className="tm-help" style={{ padding: '4px 0' }}>
        No exercises logged yet.
      </div>
    );
  }
  return (
    <div className="tm-block">
      <div className="tm-block-head">
        <span className="tm-block-name">Recorded results</span>
        <span className="tm-block-sub" style={{ marginLeft: 'auto' }}>
          target → actual
        </span>
      </div>
      <div className="tm-block-body">
        {rec.log.map((r, i) => (
          <div className="tm-ex" key={i}>
            <span
              className="tm-ex-idx"
              style={
                r.done
                  ? {
                      background: 'color-mix(in srgb, var(--accent-green) 24%, var(--secondary))',
                      color: 'var(--accent-green)',
                    }
                  : {}
              }
            >
              {r.done ? <Icon name="Check" size={12} stroke={3} /> : i + 1}
            </span>
            <div className="tm-ex-main">
              <div className="tm-ex-name">
                {r.name}
                {r.pr && (
                  <span className="tm-block-fmt" style={{ marginLeft: 8 }}>
                    <Icon name="Trophy" size={11} stroke={2.2} /> PR
                  </span>
                )}
              </div>
              <div className="tm-ex-note">
                {r.target} · {r.load}
              </div>
            </div>
            <div className="tm-ex-meta">
              <div className="tm-ex-stat">
                <div className="v">{r.actual}</div>
                <div className="k">actual</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { WorkoutStats, WorkoutBlocks, WorkoutBlock, ExerciseRow, LogResults });
