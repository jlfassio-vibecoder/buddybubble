/* ============================================================================
   TaskModal — form primitives. Exported to window for cross-file Babel scope.
   ============================================================================ */
function Icon({ name, size = 16, stroke = 2, className = '', style = {} }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const node = window.lucide && window.lucide[name];
    if (node) {
      const svg = window.lucide.createElement(node);
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('stroke-width', stroke);
      ref.current.appendChild(svg);
    }
  }, [name, size, stroke]);
  return (
    <span
      ref={ref}
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', ...style }}
    />
  );
}

const cx = (...a) => a.filter(Boolean).join(' ');

// Per-type accent (mirrors the "Choose a card type" picker). Card is neutral.
function typeColors(t) {
  if (!t || t.neutral || t.hue == null) {
    return {
      text: 'var(--muted-foreground)',
      bg: 'var(--secondary)',
      border: 'var(--border)',
      solid: 'var(--muted-foreground)',
    };
  }
  const h = t.hue;
  return {
    text: `hsl(${h} 80% 72%)`,
    bg: `hsl(${h} 70% 50% / 0.16)`,
    border: `hsl(${h} 70% 60% / 0.40)`,
    solid: `hsl(${h} 75% 60%)`,
  };
}

function Avatar({ id, size = 30, className = '' }) {
  const m = window.TM.MEMBERS[id] || { initials: id, color: 'hsl(0 0% 35%)' };
  return (
    <span
      className={cx('tm-av', className)}
      style={{ width: size, height: size, background: m.color, fontSize: size * 0.36 }}
      title={m.name}
    >
      {m.initials}
    </span>
  );
}

function AgentTag() {
  return (
    <span className="tm-agent-tag">
      <Icon name="Sparkles" size={9} stroke={2.4} /> Coach
    </span>
  );
}

/* A labelled field wrapper. `agent` highlights it as Coach-populated. */
function Field({ label, opt, help, agent, hint, children, style }) {
  return (
    <div className={cx('tm-field', agent && 'is-agent')} style={style}>
      {label && (
        <div className="tm-label">
          {label}
          {opt && <span className="opt">· optional</span>}
          {agent && <AgentTag />}
          {hint && (
            <span className="opt" style={{ marginLeft: 'auto' }}>
              {hint}
            </span>
          )}
        </div>
      )}
      {children}
      {help && <div className="tm-help">{help}</div>}
    </div>
  );
}

function Section({ icon, title, hint, sub, children }) {
  return (
    <section className="tm-section">
      <div className="tm-sec-head">
        {icon && (
          <span className="tm-sec-ico">
            <Icon name={icon} size={15} stroke={2} />
          </span>
        )}
        <span className="tm-sec-title">{title}</span>
        {hint && <span className="tm-sec-hint">{hint}</span>}
      </div>
      {sub && <p className="tm-sec-sub">{sub}</p>}
      {children}
    </section>
  );
}

function TextInput(props) {
  return <input className="tm-input" {...props} />;
}
function TextArea(props) {
  return <textarea className="tm-textarea" {...props} />;
}
function Select({ value, onChange, options, ...rest }) {
  return (
    <select className="tm-select" value={value} onChange={onChange} {...rest}>
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const lab = typeof o === 'string' ? o : o.label;
        return (
          <option key={val} value={val}>
            {lab}
          </option>
        );
      })}
    </select>
  );
}

/* Type pill grid — the selector that morphs the form. */
function TypeGrid({ value, onChange }) {
  return (
    <div className="tm-typegrid">
      {window.TM.TYPES.map((t) => (
        <button
          key={t.id}
          className={cx('tm-type', value === t.id && 'is-on')}
          onClick={() => onChange(t.id)}
        >
          <span className="tm-type-ico">
            <Icon name={t.icon} size={16} stroke={2} />
          </span>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* Header type chip → opens a compact change-type popover. The type is chosen
   up front in the "Choose a card type" picker, so inside the card it's just a
   small, recolorable pill you can click to reclassify (rare). */
function TypeChip({ type, onChange }) {
  const [open, setOpen] = React.useState(false);
  const t = window.TM.TYPES.find((x) => x.id === type) || window.TM.TYPES[0];
  const c = typeColors(t);
  return (
    <span className="tm-typechip-wrap">
      <button
        className="tm-eyebrow-pill"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ color: c.text, background: c.bg, borderColor: c.border }}
      >
        <Icon name={t.icon} size={13} stroke={2.2} /> {t.label}
        <Icon name="ChevronDown" size={12} stroke={2.4} className="chev" />
      </button>
      {open && (
        <React.Fragment>
          <div className="tm-pop-overlay" onClick={() => setOpen(false)} />
          <div className="tm-typepop" role="menu">
            <div className="tm-typepop-head">Change type</div>
            {window.TM.TYPES.map((o) => {
              const oc = typeColors(o);
              const on = o.id === type;
              return (
                <button
                  key={o.id}
                  className={cx('tm-typeopt', on && 'is-on')}
                  role="menuitemradio"
                  aria-checked={on}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <span className="tm-typeopt-ico" style={{ color: oc.text, background: oc.bg }}>
                    <Icon name={o.icon} size={15} stroke={2} />
                  </span>
                  <span className="tm-typeopt-lb">{o.label}</span>
                  {on && (
                    <Icon
                      name="Check"
                      size={15}
                      stroke={2.4}
                      className="tm-typeopt-check"
                      style={{ color: oc.solid }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      )}
    </span>
  );
}

/* Wide segmented control (visibility, class format, …). */
function SegWide({ value, onChange, options }) {
  return (
    <div className="tm-segwide">
      {options.map((o) => (
        <button
          key={o.value}
          className={cx('tm-segopt', value === o.value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={16} stroke={2} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CheckCard({ checked, onChange, title, desc }) {
  return (
    <button className={cx('tm-checkcard', checked && 'is-on')} onClick={() => onChange(!checked)}>
      <span className="tm-check">
        <Icon name="Check" size={14} stroke={3} />
      </span>
      <span>
        <span className="tm-check-title">{title}</span>
        <span className="tm-check-desc">{desc}</span>
      </span>
    </button>
  );
}

/* Collapsible disclosure (advanced / danger). */
function Disclosure({ title, meta, icon, defaultOpen = false, children }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={cx('tm-disc', open && 'is-open')}>
      <button className="tm-disc-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {icon && (
          <span className="tm-sec-ico">
            <Icon name={icon} size={15} stroke={2} />
          </span>
        )}
        <span className="tm-disc-title">{title}</span>
        {meta && (
          <span className="tm-disc-meta" style={{ marginLeft: icon ? 'auto' : 8 }}>
            {meta}
          </span>
        )}
        <Icon
          name="ChevronRight"
          size={18}
          stroke={2.2}
          className="chev"
          style={{ marginLeft: meta ? 10 : 'auto' }}
        />
      </button>
      {open && <div className="tm-disc-body">{children}</div>}
    </div>
  );
}

/* Tag toggle (recurring days, reminders). */
function TagToggle({ label, icon, on, onClick }) {
  return (
    <button className={cx('tm-tag', on && 'on')} onClick={onClick}>
      {icon && (
        <span className="ico">
          <Icon name={icon} size={13} stroke={2} />
        </span>
      )}
      {label}
    </button>
  );
}

Object.assign(window, {
  Icon,
  cx,
  typeColors,
  Avatar,
  AgentTag,
  Field,
  Section,
  TextInput,
  TextArea,
  Select,
  TypeGrid,
  TypeChip,
  SegWide,
  CheckCard,
  Disclosure,
  TagToggle,
});
