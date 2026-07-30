/* ============================================================================
   TaskModal — per-type Details bodies + Comments/Subtasks/Activity + JSON panel.
   Universal sections are shared; each card_type adds/subtracts its own block.
   ============================================================================ */

const assigneeOptions = () => [
  { value: '', label: 'Unassigned' },
  ...Object.keys(window.TM.MEMBERS).map((id) => ({ value: id, label: window.TM.MEMBERS[id].name })),
];

/* ---- shared sections --------------------------------------------------- */
function PropertiesSection({ type, rec, A }) {
  return (
    <Section icon="SlidersHorizontal" title="Properties" hint="Board metadata">
      <div className="tm-grid-3">
        <Field label="Status" agent={A('status')}>
          <Select
            value={rec.status}
            onChange={() => {}}
            options={window.TM.STATUS[type] || ['In progress', 'Done']}
          />
        </Field>
        <Field label="Priority" agent={A('priority')}>
          <Select
            value={rec.priority}
            onChange={() => {}}
            options={['Low', 'Medium', 'High', 'Urgent']}
          />
        </Field>
        <Field label="Assigned to" agent={A('assignee')}>
          <Select value={rec.assignee} onChange={() => {}} options={assigneeOptions()} />
        </Field>
      </div>
      <Field
        label="Visibility"
        help="Public cards appear on your Astro storefront and can be reserved by members."
      >
        <SegWide
          value={rec.visibility}
          onChange={() => {}}
          options={[
            { value: 'private', label: 'Private', icon: 'Lock' },
            { value: 'public', label: 'Public', icon: 'Globe' },
          ]}
        />
      </Field>
    </Section>
  );
}

function ScheduleSection({ rec, A }) {
  return (
    <Section
      icon="CalendarDays"
      title="Schedule"
      sub="Cards surface in Today on that calendar day (workspace time)."
    >
      <div className="tm-grid-2">
        <Field label="Scheduled for" agent={A('date')}>
          <input type="date" className="tm-input" defaultValue={rec.date || ''} />
        </Field>
        <Field label="Time">
          <input
            type="time"
            className="tm-input"
            defaultValue={rec.time || ''}
            disabled={!rec.date}
          />
        </Field>
      </div>
    </Section>
  );
}

function LiveCard({ rec, copy }) {
  return (
    <Field>
      <CheckCard
        checked={!!rec.live}
        onChange={() => {}}
        title="Enable live Huddle session"
        desc={copy}
      />
    </Field>
  );
}

function AdvancedSection({ type, rec }) {
  return (
    <Disclosure title="Cover & appearance" icon="Image" meta="Board & chat cover">
      <Field>
        <p className="tm-sec-sub" style={{ margin: '0 0 11px' }}>
          Optional image shown behind the title and details on the board and in chat.
        </p>
        <div className="tm-uploadrow" style={{ marginBottom: 13 }}>
          <button className="tm-btn tm-btn-secondary">
            <Icon name="Upload" size={15} stroke={2} /> Upload image
          </button>
        </div>
      </Field>
      <Field label="Visual preset">
        <Select
          value="auto"
          onChange={() => {}}
          options={[
            { value: 'auto', label: 'Auto (by card type)' },
            { value: 'photo', label: 'Photographic' },
            { value: 'gradient', label: 'Gradient' },
            { value: 'minimal', label: 'Minimal' },
          ]}
        />
      </Field>
      <Field label="Style hint" opt>
        <input className="tm-input" placeholder="e.g. soft gradients, minimal illustration" />
      </Field>
      <button className="tm-btn tm-btn-secondary">
        <Icon name="WandSparkles" size={15} stroke={2} /> Generate cover (AI)
      </button>
    </Disclosure>
  );
}

function AttachmentsDisclosure({ rec }) {
  return (
    <Disclosure title="Attachments & files" icon="Paperclip" meta="0 files">
      <Field help="PDFs, images, or a program export. Shown in the card's Files drawer.">
        <div className="tm-uploadrow">
          <button className="tm-btn tm-btn-secondary">
            <Icon name="Paperclip" size={15} stroke={2} /> Choose file
          </button>
          <span className="tm-filechip">No file chosen</span>
        </div>
      </Field>
    </Disclosure>
  );
}

function DangerSection() {
  return (
    <Disclosure title="Danger zone" icon="TriangleAlert" meta="Archive · Delete">
      <div className="tm-danger">
        <div className="tm-danger-title">Archive card</div>
        <div className="tm-danger-desc">
          Hides this card from the board and calendar. Recovery from archive is not available in
          this version yet.
        </div>
        <button className="tm-btn tm-btn-danger">
          <Icon name="Archive" size={14} stroke={2} /> Archive card
        </button>
      </div>
      <div className="tm-danger">
        <div className="tm-danger-title">Delete card</div>
        <div className="tm-danger-desc">
          Permanently removes this card and its chat history. This cannot be undone.
        </div>
        <button className="tm-btn tm-btn-danger-solid">
          <Icon name="Trash2" size={14} stroke={2} /> Delete card
        </button>
      </div>
    </Disclosure>
  );
}

/* ---- type-specific bodies ---------------------------------------------- */
function WorkoutBody({ rec, A }) {
  return (
    <Section
      icon="Dumbbell"
      title="Workout"
      sub="Structured by the Coach into parametric blocks. Edits here update the canonical workout_set."
    >
      <WorkoutStats rec={rec} />
      <LiveCard
        rec={rec}
        copy="Run this as a live Huddle with an AMRAP/EMOM timer on the stage. End from the live dock when finished."
      />
      <div style={{ marginTop: 14 }}>
        <WorkoutBlocks rec={rec} />
      </div>
    </Section>
  );
}

function WorkoutLogBody({ rec, A }) {
  const tiles = [
    { k: 'Duration', v: rec.actual_duration_min || '—', u: rec.actual_duration_min ? 'min' : '' },
    { k: 'Session RPE', v: rec.session_rpe || '—' },
    {
      k: 'Completion',
      v: rec.completion != null ? rec.completion : '—',
      u: rec.completion != null ? '%' : '',
    },
  ];
  return (
    <Section
      icon="ClipboardList"
      title="Session log"
      sub="A record of what was actually performed — logged after the session, not a plan."
    >
      <div className="tm-grid-2" style={{ marginBottom: 14 }}>
        <Field label="Performed on">
          <input type="date" className="tm-input" defaultValue={rec.performed_on || ''} />
        </Field>
        <Field label="Start time">
          <input type="time" className="tm-input" defaultValue={rec.performed_time || ''} />
        </Field>
      </div>
      <div className="tm-stats" style={{ marginBottom: 16 }}>
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
      <LogResults rec={rec} />
    </Section>
  );
}

function ProgramBody({ rec, A }) {
  const ids = ['TL', 'RS', 'JF', 'MK', 'you'];
  const extra = Math.max(0, (rec.enrolled || 0) - 4);
  return (
    <Section
      icon="ListChecks"
      title="Program structure"
      sub="A multi-week container of linked Workout cards. Members enroll and progress week by week."
    >
      <div className="tm-grid-3" style={{ marginBottom: 4 }}>
        <Field label="Duration" agent={A('weeks')}>
          <div style={{ position: 'relative' }}>
            <input className="tm-input" defaultValue={rec.weeks || ''} placeholder="6" />
            <span
              style={{
                position: 'absolute',
                right: 13,
                top: 12,
                fontSize: 13,
                color: 'var(--muted-foreground)',
              }}
            >
              weeks
            </span>
          </div>
        </Field>
        <Field label="Per week" agent={A('days_per_week')}>
          <div style={{ position: 'relative' }}>
            <input className="tm-input" defaultValue={rec.days_per_week || ''} placeholder="3" />
            <span
              style={{
                position: 'absolute',
                right: 13,
                top: 12,
                fontSize: 13,
                color: 'var(--muted-foreground)',
              }}
            >
              days
            </span>
          </div>
        </Field>
        <Field label="Level">
          <Select
            value={rec.level}
            onChange={() => {}}
            options={['Beginner', 'Intermediate', 'Advanced']}
          />
        </Field>
      </div>
      <div className="tm-grid-2">
        <Field label="Start date">
          <input type="date" className="tm-input" defaultValue={rec.date || ''} />
        </Field>
        <Field label="Enrollment">
          <div className="tm-enroll">
            <div className="tm-av-stack">
              {ids.slice(0, 4).map((id) => (
                <Avatar key={id} id={id} size={30} />
              ))}
              {extra > 0 && <span className="tm-av more">+{extra}</span>}
            </div>
            <span className="tm-rsvp-spots">
              {rec.enrolled || 0}/{rec.capacity || '∞'} enrolled
            </span>
          </div>
        </Field>
      </div>
      <Field
        label="Weekly schedule"
        agent={A('schedule')}
        hint={(rec.schedule || []).length + ' of ' + (rec.weeks || '—') + ' weeks'}
      >
        {(rec.schedule || []).length === 0 ? (
          <div className="tm-help" style={{ padding: '4px 0' }}>
            No sessions yet — ask the Coach to lay out the weeks.
          </div>
        ) : (
          rec.schedule.map((w) => (
            <div className="tm-week" key={w.week}>
              <div className="tm-week-head">
                <span className="tm-week-tag">Week {w.week}</span>
                <span className="tm-week-name">{w.focus}</span>
                <span className="tm-week-meta">{w.sessions.length} sessions</span>
              </div>
              {w.sessions.map((s, i) => (
                <div className={cx('tm-sess', s.type === 'Rest' && 'rest')} key={i}>
                  <span className="tm-sess-day">{s.day}</span>
                  <span className="tm-sess-link">
                    <span className="ico">
                      <Icon name={s.type === 'Rest' ? 'Moon' : 'Dumbbell'} size={14} stroke={2} />
                    </span>
                    {s.title}
                  </span>
                  <span className="tm-sess-type">{s.type === 'Rest' ? 'Rest' : 'Workout →'}</span>
                </div>
              ))}
            </div>
          ))
        )}
        <button
          className="tm-btn tm-btn-ghost tm-btn-block"
          style={{ borderColor: 'var(--border)', borderStyle: 'dashed', height: 42, marginTop: 4 }}
        >
          <Icon name="Plus" size={15} stroke={2.4} /> Add week
        </button>
      </Field>
    </Section>
  );
}

function ClassBody({ rec, A }) {
  const online = rec.format === 'online' || rec.format === 'hybrid';
  const inperson = rec.format === 'in_person' || rec.format === 'hybrid';
  const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const allReminders = ['1 day before', '1 hour before', '15 min before', 'At start'];
  const pct = rec.capacity ? Math.round((rec.reserved / rec.capacity) * 100) : 0;
  return (
    <React.Fragment>
      <Section
        icon="GraduationCap"
        title="Class details"
        sub="An online or in-person fitness class members can find, reserve a spot in, and get reminders for."
      >
        <Field label="Format" agent={A('format')}>
          <SegWide
            value={rec.format}
            onChange={() => {}}
            options={[
              { value: 'online', label: 'Online', icon: 'Video' },
              { value: 'in_person', label: 'In-person', icon: 'MapPin' },
              { value: 'hybrid', label: 'Hybrid', icon: 'Globe' },
            ]}
          />
        </Field>
        {inperson && (
          <Field label="Location">
            <input
              className="tm-input"
              defaultValue={rec.location || ''}
              placeholder="Venue or address"
            />
          </Field>
        )}
        {online && (
          <React.Fragment>
            <Field label="Join link">
              <input
                className="tm-input"
                defaultValue={rec.join_link || ''}
                placeholder="huddle.buddybubble.app/…"
              />
            </Field>
            <LiveCard
              rec={rec}
              copy="Members join the live Huddle stage at start time. The link unlocks 10 minutes before."
            />
          </React.Fragment>
        )}
        <Field label="Instructor">
          <Select value={rec.instructor} onChange={() => {}} options={assigneeOptions()} />
        </Field>
      </Section>

      <Section
        icon="Clock"
        title="When"
        sub="Set a first session, then a recurrence so members see every upcoming class."
      >
        <div className="tm-grid-2">
          <Field label="Starts">
            <input type="datetime-local" className="tm-input" defaultValue={rec.starts || ''} />
          </Field>
          <Field label="Ends">
            <input type="datetime-local" className="tm-input" defaultValue={rec.ends || ''} />
          </Field>
        </div>
        <Field label="Repeats" agent={A('recurring')}>
          <Select
            value={rec.recurring}
            onChange={() => {}}
            options={[
              { value: 'none', label: 'Does not repeat' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        </Field>
        {rec.recurring === 'weekly' && (
          <Field label="On days" agent={A('days')}>
            <div className="tm-tag-row">
              {allDays.map((d) => (
                <TagToggle key={d} label={d} on={(rec.days || []).includes(d)} onClick={() => {}} />
              ))}
            </div>
          </Field>
        )}
      </Section>

      <Section icon="Users" title="Signup & reminders">
        <Field label="Capacity">
          <div className="tm-rsvp">
            <div className="tm-rsvp-info">
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {rec.reserved || 0} reserved ·{' '}
                {rec.capacity ? rec.capacity - (rec.reserved || 0) : '∞'} spots left
              </div>
              <div className="tm-rsvp-spots">{rec.price || 'Set a price'}</div>
              {rec.capacity ? (
                <div className="tm-rsvp-bar">
                  <div className="tm-rsvp-fill" style={{ width: pct + '%' }} />
                </div>
              ) : null}
            </div>
            <button className="tm-btn tm-btn-primary">Reserve a spot</button>
          </div>
        </Field>
        <Field label="Price">
          <input
            className="tm-input"
            defaultValue={rec.price || ''}
            placeholder="$0 · members · or $15 drop-in"
          />
        </Field>
        <Field label="Reminders">
          <div className="tm-tag-row">
            {allReminders.map((r) => (
              <TagToggle
                key={r}
                label={r}
                icon="Bell"
                on={(rec.reminders || []).includes(r)}
                onClick={() => {}}
              />
            ))}
          </div>
        </Field>
      </Section>
    </React.Fragment>
  );
}

/* ---- Event / Experience / Idea / Memory -------------------------------- */
function TagList({ items, icon, addLabel = 'Add' }) {
  return (
    <div className="tm-tag-row">
      {items.map((t, i) => (
        <span className="tm-tag" key={i}>
          {icon && (
            <span className="ico">
              <Icon name={icon} size={13} stroke={2} />
            </span>
          )}
          {t}
        </span>
      ))}
      <button
        className="tm-tag"
        style={{ borderStyle: 'dashed', color: 'var(--muted-foreground)' }}
      >
        <Icon name="Plus" size={13} stroke={2.4} /> {addLabel}
      </button>
    </div>
  );
}

function EventBody({ rec, A }) {
  const ids = rec.going_people || [];
  const left = rec.capacity ? Math.max(0, rec.capacity - (rec.going || 0)) : null;
  const pct = rec.capacity ? Math.round(((rec.going || 0) / rec.capacity) * 100) : 0;
  return (
    <React.Fragment>
      <Section
        icon="MapPin"
        title="Event details"
        sub="A real-world meetup members can find, RSVP to, and show up for."
      >
        <Field label="Location" agent={A('location')}>
          <input
            className="tm-input"
            defaultValue={rec.location || ''}
            placeholder="Venue or address"
          />
        </Field>
        <div className="tm-grid-2">
          <Field label="Starts">
            <input type="datetime-local" className="tm-input" defaultValue={rec.starts || ''} />
          </Field>
          <Field label="Ends">
            <input type="datetime-local" className="tm-input" defaultValue={rec.ends || ''} />
          </Field>
        </div>
        <Field label="Cost">
          <input
            className="tm-input"
            defaultValue={rec.cost || ''}
            placeholder="Free · or $5 at the door"
          />
        </Field>
      </Section>

      <Section icon="Users" title="Who's going">
        <Field>
          <div className="tm-rsvp">
            <div className="tm-rsvp-info">
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {rec.going || 0} going{left != null ? ` · ${left} spots left` : ''}
              </div>
              <div className="tm-av-stack" style={{ marginTop: 8 }}>
                {ids.slice(0, 5).map((id) => (
                  <Avatar key={id} id={id} size={28} />
                ))}
                {ids.length > 5 && <span className="tm-av more">+{ids.length - 5}</span>}
              </div>
              {rec.capacity ? (
                <div className="tm-rsvp-bar" style={{ marginTop: 9 }}>
                  <div className="tm-rsvp-fill" style={{ width: pct + '%' }} />
                </div>
              ) : null}
            </div>
            <button className="tm-btn tm-btn-primary">
              <Icon name="Check" size={15} stroke={2.4} /> I'm going
            </button>
          </div>
        </Field>
        <Field label="What to bring" agent={A('bring')}>
          <TagList items={rec.bring || []} icon="Package" addLabel="Add item" />
        </Field>
      </Section>
    </React.Fragment>
  );
}

function ExperienceBody({ rec, A }) {
  return (
    <React.Fragment>
      <Section
        icon="Sparkles"
        title="Experience"
        sub="A public, shareable offering — the story and the logistics that make it worth booking."
      >
        <Field label="Highlights" agent={A('highlights')}>
          {(rec.highlights || []).length === 0 ? (
            <div className="tm-help" style={{ padding: '4px 0' }}>
              What makes this special? Ask the agent to draft a few highlights.
            </div>
          ) : (
            <div className="tm-list">
              {rec.highlights.map((h, i) => (
                <div className="tm-list-item" key={i}>
                  <span className="tm-list-ico">
                    <Icon name="Star" size={15} stroke={2} />
                  </span>
                  {h}
                </div>
              ))}
            </div>
          )}
          <button className="tm-list-add">
            <Icon name="Plus" size={14} stroke={2.4} /> Add highlight
          </button>
        </Field>
        <div className="tm-grid-3">
          <Field label="Duration" agent={A('duration_min')}>
            <div style={{ position: 'relative' }}>
              <input className="tm-input" defaultValue={rec.duration_min || ''} placeholder="150" />
              <span
                style={{
                  position: 'absolute',
                  right: 13,
                  top: 12,
                  fontSize: 13,
                  color: 'var(--muted-foreground)',
                }}
              >
                min
              </span>
            </div>
          </Field>
          <Field label="Group size">
            <input
              className="tm-input"
              defaultValue={
                rec.group_min && rec.group_max ? `${rec.group_min}–${rec.group_max}` : ''
              }
              placeholder="4–8"
            />
          </Field>
          <Field label="Price">
            <input className="tm-input" defaultValue={rec.price || ''} placeholder="$28" />
          </Field>
        </div>
        <Field label="Location">
          <input
            className="tm-input"
            defaultValue={rec.location || ''}
            placeholder="Where it happens"
          />
        </Field>
      </Section>

      <Section icon="CircleCheck" title="What's included" agent={A('includes')}>
        <Field agent={A('includes')}>
          {(rec.includes || []).length === 0 ? (
            <div className="tm-help" style={{ padding: '4px 0' }}>
              List what's provided.
            </div>
          ) : (
            <div className="tm-list">
              {rec.includes.map((it, i) => (
                <div className="tm-list-item" key={i}>
                  <span className="tm-list-ico">
                    <Icon name="Check" size={15} stroke={2.4} />
                  </span>
                  {it}
                </div>
              ))}
            </div>
          )}
          <button className="tm-list-add">
            <Icon name="Plus" size={14} stroke={2.4} /> Add item
          </button>
        </Field>
        <Field label="Good for">
          <TagList items={rec.good_for || []} addLabel="Add tag" />
        </Field>
      </Section>
    </React.Fragment>
  );
}

function IdeaBody({ rec, A }) {
  return (
    <React.Fragment>
      <Section
        icon="Lightbulb"
        title="Idea"
        sub="A lightweight proposal the community can rally behind before it becomes anything bigger."
      >
        <Field label="Interest">
          <div className="tm-vote">
            <button className={cx('tm-vote-btn', rec.voted && 'on')}>
              <Icon name="ChevronUp" size={16} stroke={2.4} />
              <span className="tm-vote-n">{rec.votes || 0}</span>
              <span className="tm-vote-k">votes</span>
            </button>
            <div className="tm-vote-info">
              <div className="tm-vote-title">
                {rec.voted ? "You're in" : 'Vote to show interest'}
              </div>
              <div className="tm-vote-sub">
                Members upvote ideas worth pursuing. High-interest ideas surface to organizers.
              </div>
            </div>
          </div>
        </Field>
        <div className="tm-grid-2">
          <Field label="Effort">
            <Select value={rec.effort} onChange={() => {}} options={['Low', 'Medium', 'High']} />
          </Field>
          <Field label="Impact">
            <Select value={rec.impact} onChange={() => {}} options={['Low', 'Medium', 'High']} />
          </Field>
        </div>
        <Field label="Tags" agent={A('tags')}>
          <TagList items={rec.tags || []} addLabel="Add tag" />
        </Field>
      </Section>

      <Section
        icon="ArrowUpRight"
        title="Promote"
        sub="When an idea is ready, graduate it to a real card type — it keeps its title, description, and discussion."
      >
        <div className="tm-promote">
          {['event', 'program', 'class'].map((id) => {
            const o = window.TM.TYPES.find((t) => t.id === id);
            const c = typeColors(o);
            return (
              <button key={id} className="tm-promote-btn" onClick={() => window.__tmSetType(id)}>
                <span style={{ color: c.text, display: 'inline-flex' }}>
                  <Icon name={o.icon} size={15} stroke={2} />
                </span>
                Promote to {o.label}
              </button>
            );
          })}
        </div>
      </Section>
    </React.Fragment>
  );
}

function MemoryBody({ rec, A }) {
  const n = rec.photos || 0;
  return (
    <React.Fragment>
      <Section
        icon="Camera"
        title="Moment"
        sub="A captured moment from something that already happened — shared back to the community."
      >
        <div className="tm-grid-2">
          <Field label="Happened on">
            <input type="date" className="tm-input" defaultValue={rec.happened_on || ''} />
          </Field>
          <Field label="Where">
            <input className="tm-input" defaultValue={rec.location || ''} placeholder="Place" />
          </Field>
        </div>
        {rec.linked_event && (
          <Field label="From">
            <span className="tm-tag on">
              <span className="ico">
                <Icon name="CalendarDays" size={13} stroke={2} />
              </span>
              {rec.linked_event}
            </span>
          </Field>
        )}
      </Section>

      <Section icon="Image" title="Photos" hint={n ? `${n} photos` : 'Drop photos'}>
        <div className="tm-gallery">
          {Array.from({ length: n }).map((_, i) => (
            <div className="tm-photo" key={i}>
              <span className="lb">photo {i + 1}</span>
            </div>
          ))}
          <button className="tm-photo add">
            <Icon name="Plus" size={18} stroke={2} />
          </button>
        </div>
      </Section>

      <Section icon="Users" title="People & reactions">
        <Field label="Tagged">
          <div className="tm-enroll">
            <div className="tm-av-stack">
              {(rec.people || []).slice(0, 5).map((id) => (
                <Avatar key={id} id={id} size={30} />
              ))}
              <button className="tm-av more" style={{ border: '1px dashed var(--border)' }}>
                <Icon name="Plus" size={14} stroke={2.4} />
              </button>
            </div>
            <span className="tm-rsvp-spots">{(rec.people || []).length} tagged</span>
          </div>
        </Field>
        {(rec.reactions || []).length > 0 && (
          <Field label="Reactions">
            <div className="tm-comment-react">
              {rec.reactions.map((r, j) => (
                <span className={cx('tm-react', r.on && 'on')} key={j}>
                  {r.e} {r.n}
                </span>
              ))}
              <button className="tm-react">
                <Icon name="SmilePlus" size={13} stroke={2} />
              </button>
            </div>
          </Field>
        )}
      </Section>
    </React.Fragment>
  );
}

/* ---- Details assembler ------------------------------------------------- */
function DetailsForm({ type, rec, filled }) {
  const agentSet = new Set(filled ? rec._agent || [] : []);
  const A = (k) => agentSet.has(k);
  const designed = window.TM.DESIGNED.includes(type);
  const typeLabel = (window.TM.TYPES.find((t) => t.id === type) || {}).label;

  return (
    <div className="tm-pad">
      {filled && (
        <div className="tm-persona-strip">
          <span className="tm-persona-av">C</span>
          <div className="tm-persona-txt">
            <div className="tm-persona-name">
              Coach hydrated this Canvas{' '}
              <span className="tm-agent-tag">{agentSet.size} fields</span>
            </div>
            <div className="tm-persona-sub">
              The Persona filled the form through chat — the Canvas stays the source of truth.
            </div>
          </div>
        </div>
      )}

      <PropertiesSection type={type} rec={rec} A={A} />

      {type === 'workout' && <WorkoutBody rec={rec} A={A} />}
      {type === 'workout_log' && <WorkoutLogBody rec={rec} A={A} />}
      {type === 'program' && <ProgramBody rec={rec} A={A} />}
      {type === 'class' && <ClassBody rec={rec} A={A} />}
      {type === 'event' && <EventBody rec={rec} A={A} />}
      {type === 'experience' && <ExperienceBody rec={rec} A={A} />}
      {type === 'idea' && <IdeaBody rec={rec} A={A} />}
      {type === 'memory' && <MemoryBody rec={rec} A={A} />}

      {(type === 'card' || type === 'workout' || type === 'program') && (
        <ScheduleSection rec={rec} A={A} />
      )}

      {!designed && (
        <Section icon="Sparkles" title={typeLabel + ' fields'}>
          <p className="tm-sec-sub" style={{ margin: 0 }}>
            The <b style={{ color: 'var(--foreground)' }}>{typeLabel}</b> form inherits the
            universal template. Its parametric fields aren't part of this pass — switch to Workout,
            Workout log, Program, or Class to see specialized canvases.
          </p>
        </Section>
      )}

      {!(
        type === 'workout' ||
        type === 'class' ||
        type === 'idea' ||
        type === 'memory' ||
        type === 'workout_log'
      ) && (
        <Section icon="Video" title="Live & visibility">
          <LiveCard
            rec={rec}
            copy="Adds a Join live session control on this card. End the session from the live dock when finished."
          />
        </Section>
      )}

      <AdvancedSection type={type} rec={rec} />
      <AttachmentsDisclosure rec={rec} />
      <DangerSection />
    </div>
  );
}

/* ---- side tabs --------------------------------------------------------- */
function CommentsTab() {
  return (
    <div className="tm-pad">
      <div className="tm-comments">
        {window.TM.COMMENTS.map((c, i) => {
          const m = c.persona ? window.TM.PERSONA : window.TM.MEMBERS[c.from];
          return (
            <div className="tm-comment" key={i}>
              {c.persona ? (
                <span className="tm-persona-av" style={{ width: 32, height: 32 }}>
                  C
                </span>
              ) : (
                <Avatar id={c.from} size={32} />
              )}
              <div className="tm-comment-body">
                <div className="tm-comment-meta">
                  <span className="tm-comment-name">{c.persona ? 'Coach' : m.name}</span>
                  {c.persona && <span className="tm-agent-tag">Persona</span>}
                  <span className="tm-comment-time">{c.time}</span>
                </div>
                <div className="tm-comment-text">{c.text}</div>
                {c.card && (
                  <div
                    className="tm-msg-card"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      marginTop: 8,
                      background: 'var(--secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '6px 11px',
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    <Icon name="LayoutGrid" size={13} stroke={2} /> {c.card}
                  </div>
                )}
                {c.reacts.length > 0 && (
                  <div className="tm-comment-react">
                    {c.reacts.map((r, j) => (
                      <span className={cx('tm-react', r.on && 'on')} key={j}>
                        {r.e} {r.n}
                      </span>
                    ))}
                    <button className="tm-react">
                      <Icon name="SmilePlus" size={13} stroke={2} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="tm-composer">
        <Avatar id="you" size={32} />
        <input className="tm-input" placeholder="Add a comment…" />
        <button className="tm-btn tm-btn-primary tm-btn-lg">
          <Icon name="Send" size={15} stroke={2.2} />
        </button>
      </div>
    </div>
  );
}

function SubtasksTab() {
  const done = window.TM.SUBTASKS.filter((s) => s.done).length;
  const pct = Math.round((done / window.TM.SUBTASKS.length) * 100);
  return (
    <div className="tm-pad">
      <div className="tm-progress-row">
        <span className="tm-progress-lb">
          {done}/{window.TM.SUBTASKS.length}
        </span>
        <div className="tm-progress-bar">
          <div className="tm-progress-fill" style={{ width: pct + '%' }} />
        </div>
        <span className="tm-progress-lb">{pct}%</span>
      </div>
      {window.TM.SUBTASKS.map((s, i) => (
        <div className={cx('tm-subtask', s.done && 'done')} key={i}>
          <span className="tm-subbox">
            <Icon name="Check" size={13} stroke={3} />
          </span>
          <span className="tm-subtask-txt">{s.txt}</span>
          <Avatar id={s.who} size={24} className="tm-subtask-av" />
        </div>
      ))}
      <div className="tm-composer">
        <button
          className="tm-btn tm-btn-ghost tm-btn-block"
          style={{
            borderColor: 'var(--border)',
            borderStyle: 'dashed',
            height: 42,
            justifyContent: 'flex-start',
          }}
        >
          <Icon name="Plus" size={15} stroke={2.4} /> Add subtask
        </button>
      </div>
    </div>
  );
}

function ActivityTab() {
  return (
    <div className="tm-pad">
      <div className="tm-activity">
        {window.TM.ACTIVITY.map((a, i) => (
          <div className="tm-act" key={i}>
            <span className={cx('tm-act-dot', a.accent && 'accent')}>
              <Icon name={a.ico} size={13} stroke={2} />
            </span>
            <div className="tm-act-body">
              <div className="tm-act-text" dangerouslySetInnerHTML={{ __html: a.text }} />
              <div className="tm-act-time">{a.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- JSON panel -------------------------------------------------------- */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function highlightJson(json) {
  return esc(json).replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?)/g,
    (m) => {
      let c = 'n';
      if (/^"/.test(m)) c = /:$/.test(m) ? 'k' : 's';
      else if (/true|false/.test(m)) c = 'b';
      else if (/null/.test(m)) c = 'c';
      return '<span class="' + c + '">' + m + '</span>';
    },
  );
}
function highlightSpec(text) {
  return text
    .split('\n')
    .map((line) => {
      let code = line,
        comment = '';
      const ci = line.indexOf('//');
      if (ci >= 0) {
        code = line.slice(0, ci);
        comment = line.slice(ci);
      }
      code = esc(code)
        .replace(/"([\w_\-]+)"(\s*:)/g, '<span class="k">"$1"</span>$2')
        .replace(/(:\s*)"([^"]*)"/g, (mm, p, v) => p + '<span class="s">"' + v + '"</span>')
        .replace(/&lt;enum&gt;/g, '<span class="b">&lt;enum&gt;</span>');
      return code + (comment ? '<span class="c">' + esc(comment) + '</span>' : '');
    })
    .join('\n');
}
function cardValuesJson(type, rec) {
  const out = { card_type: type };
  Object.keys(rec).forEach((k) => {
    if (k !== '_agent') out[k] = rec[k];
  });
  return JSON.stringify(out, null, 2);
}

function JsonPanel({ type, rec, filled, onClose }) {
  const [tab, setTab] = React.useState('spec');
  const typeLabel = (window.TM.TYPES.find((t) => t.id === type) || {}).label;
  const html =
    tab === 'spec'
      ? highlightSpec(window.TM.SCHEMA[type] || window.TM.SCHEMA.card)
      : highlightJson(cardValuesJson(type, rec));
  return (
    <aside className="tm-json">
      <div className="tm-json-head">
        <span className="tm-sec-ico">
          <Icon name="Braces" size={15} stroke={2} />
        </span>
        <div>
          <div className="tm-json-title">{typeLabel} canvas</div>
          <div className="tm-json-sub">strict JSON contract</div>
        </div>
        <div className="tm-json-tabs">
          <button
            className={cx('tm-json-tab', tab === 'spec' && 'is-on')}
            onClick={() => setTab('spec')}
          >
            Schema
          </button>
          <button
            className={cx('tm-json-tab', tab === 'card' && 'is-on')}
            onClick={() => setTab('card')}
          >
            Card
          </button>
        </div>
      </div>
      <div className="tm-json-body">
        <pre className="tm-code" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <div className="tm-json-foot">
        {tab === 'spec'
          ? 'The closed-world form contract. The Persona may only fill these keys — it cannot invent fields or formats.'
          : filled
            ? 'Live values the Coach hydrated through chat.'
            : 'Empty card — defaults only. Switch to Agent-filled to see hydrated values.'}
      </div>
    </aside>
  );
}

Object.assign(window, { DetailsForm, CommentsTab, SubtasksTab, ActivityTab, JsonPanel });
