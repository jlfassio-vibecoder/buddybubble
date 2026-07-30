/* ============================================================================
   TaskModal — shell (cover header · tabs · footer / mobile tab bar),
   showcase chrome, and the app root that wires type / state / device / JSON.
   ============================================================================ */
const { useState, useEffect } = React;

const TABS = [
  { id: 'details', label: 'Details', icon: 'FileText' },
  { id: 'comments', label: 'Comments', icon: 'MessageSquare', count: window.TM.COMMENTS.length },
  { id: 'subtasks', label: 'Subtasks', icon: 'ListTodo', count: '2/4' },
  { id: 'activity', label: 'Activity', icon: 'History' },
];

function CoverHeader({ type, rec, filled }) {
  return (
    <header className={cx('tm-cover')}>
      <div className="tm-cover-inner">
        <div className="tm-cover-top">
          <TypeChip type={type} onChange={(id) => window.__tmSetType(id)} />
          <span className="tm-eyebrow-meta">
            <Icon name={rec.visibility === 'public' ? 'Globe' : 'Lock'} size={12} stroke={2} />
            {rec.visibility === 'public' ? 'Public' : 'Private'}
          </span>
          {rec.live && (
            <span className="tm-live-chip">
              <span className="tm-live-dot" /> Live Huddle
            </span>
          )}
          <div className="tm-cover-actions">
            <button className="tm-iconbtn" title="More">
              <Icon name="Ellipsis" size={17} stroke={2} />
            </button>
            <button className="tm-iconbtn" title="Close">
              <Icon name="X" size={18} stroke={2.2} />
            </button>
          </div>
        </div>
        <input
          className="tm-title-input"
          defaultValue={rec.title}
          key={'t' + type + filled}
          placeholder="Untitled card"
        />
        <textarea
          className="tm-desc-input"
          defaultValue={rec.description}
          key={'d' + type + filled}
          rows={2}
          placeholder="Add a description… or let the Coach fill it from chat."
        />
      </div>
    </header>
  );
}

function TabStrip({ tab, setTab }) {
  return (
    <nav className="tm-tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={cx('tm-tab', tab === t.id && 'is-on')}
          onClick={() => setTab(t.id)}
        >
          <Icon name={t.icon} size={15} stroke={2} /> {t.label}
          {t.count != null && <span className="tm-tab-count">{t.count}</span>}
        </button>
      ))}
    </nav>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <nav className="tm-tabbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={cx('tm-tabbar-btn', tab === t.id && 'is-on')}
          onClick={() => setTab(t.id)}
        >
          <Icon name={t.icon} size={20} stroke={2} />
          <span className="lb">{t.label}</span>
          {typeof t.count === 'number' && <span className="tm-tabbar-badge">{t.count}</span>}
        </button>
      ))}
    </nav>
  );
}

function Footer() {
  return (
    <footer className="tm-foot">
      <span className="tm-foot-hint">
        <span className="ico">
          <Icon name="Check" size={13} stroke={2.4} />
        </span>{' '}
        All changes saved
      </span>
      <div className="tm-foot-actions">
        <button className="tm-btn tm-btn-ghost">Cancel</button>
        <button className="tm-btn tm-btn-primary">Save card</button>
      </div>
    </footer>
  );
}

function ModalBody({ type, rec, filled, tab }) {
  return (
    <div className="tm-body">
      {tab === 'details' && <DetailsForm type={type} rec={rec} filled={filled} />}
      {tab === 'comments' && <CommentsTab />}
      {tab === 'subtasks' && <SubtasksTab />}
      {tab === 'activity' && <ActivityTab />}
    </div>
  );
}

/* ---- showcase chrome --------------------------------------------------- */
function Seg({ value, onChange, options }) {
  return (
    <div className="tm-seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={cx('tm-seg-btn', value === o.value && 'is-on', o.accent && 'accent')}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={14} stroke={2} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Backdrop() {
  return (
    <div className="tm-backdrop">
      <div className="tm-ghost-cols">
        {[0, 1, 2, 3].map((c) => (
          <div className="tm-ghost-col" key={c}>
            <div className="tm-ghost-card tall" />
            <div className="tm-ghost-card" />
            <div className="tm-ghost-card" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskModalShell({ type, rec, filled, tab, setTab, mobile }) {
  return (
    <div className={cx('tm-card', mobile && 'is-mobile')}>
      <CoverHeader type={type} rec={rec} filled={filled} />
      {!mobile && <TabStrip tab={tab} setTab={setTab} />}
      <ModalBody type={type} rec={rec} filled={filled} tab={tab} />
      {tab === 'details' && <Footer />}
      {mobile && <TabBar tab={tab} setTab={setTab} />}
    </div>
  );
}

function Root() {
  const [type, setType] = useState('workout');
  const [filled, setFilled] = useState(true);
  const [device, setDevice] = useState('desktop');
  const [showJson, setShowJson] = useState(true);
  const [tab, setTab] = useState('details');

  useEffect(() => {
    window.__tmSetType = (t) => {
      setType(t);
      setTab('details');
    };
  }, []);

  const store = filled ? window.TM.RECORDS : window.TM.EMPTY;
  const rec = store[type] || store.card;
  const mobile = device === 'mobile';

  return (
    <div className="tm-stage">
      <header className="tm-bar">
        <div className="tm-bar-brand">
          <span className="tm-bar-mark">
            <Icon name="LayoutGrid" size={17} stroke={2.2} />
          </span>
          <div className="tm-bar-titles">
            <span className="tm-bar-title">TaskModal · Universal Canvas</span>
            <span className="tm-bar-sub">
              Persona · Context · Canvas — one parametric form, hydrated by chat
            </span>
          </div>
        </div>
        <div className="tm-bar-controls">
          <div className="tm-ctl">
            <span className="tm-ctl-lb">State</span>
            <Seg
              value={filled ? 'filled' : 'empty'}
              onChange={(v) => setFilled(v === 'filled')}
              options={[
                { value: 'empty', label: 'Empty' },
                { value: 'filled', label: 'Agent-filled', icon: 'Sparkles', accent: true },
              ]}
            />
          </div>
          <div className="tm-ctl">
            <span className="tm-ctl-lb">Surface</span>
            <Seg
              value={device}
              onChange={setDevice}
              options={[
                { value: 'desktop', label: 'Desktop', icon: 'Monitor' },
                { value: 'mobile', label: 'Mobile', icon: 'Smartphone' },
              ]}
            />
          </div>
          <div className="tm-ctl">
            <span className="tm-ctl-lb">JSON</span>
            <Seg
              value={showJson ? 'on' : 'off'}
              onChange={(v) => setShowJson(v === 'on')}
              options={[
                { value: 'off', label: 'Hide' },
                { value: 'on', label: 'Schema', icon: 'Braces' },
              ]}
            />
          </div>
        </div>
      </header>

      <div className={cx('tm-work', mobile && 'is-mobile')}>
        <Backdrop />
        <TaskModalShell
          type={type}
          rec={rec}
          filled={filled}
          tab={tab}
          setTab={setTab}
          mobile={mobile}
        />
        {showJson && <JsonPanel type={type} rec={rec} filled={filled} />}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
