/* ============================================================================
   TaskModal data — card types, example records (agent-filled state), and the
   strict-JSON schema definitions surfaced in the side panel.

   PCC model: the Canvas is a parametric card. A `card_type` selects a closed
   set of sections/fields (the form). The Persona (agent) hydrates the values
   through chat; the form itself stays static. Workout cards additionally carry
   the parametric `blocks[]` library (block_format + format_params).
   ============================================================================ */
window.TM = (function () {
  const TYPES = [
    { id: 'card', label: 'Card', icon: 'SquareCheckBig', neutral: true },
    { id: 'event', label: 'Event', icon: 'MapPin', hue: 217 },
    { id: 'experience', label: 'Experience', icon: 'Sparkles', hue: 263 },
    { id: 'idea', label: 'Idea', icon: 'Lightbulb', hue: 43 },
    { id: 'memory', label: 'Memory', icon: 'Camera', hue: 340 },
    { id: 'workout', label: 'Workout', icon: 'Dumbbell', hue: 0 },
    { id: 'workout_log', label: 'Workout log', icon: 'ClipboardList', hue: 28 },
    { id: 'program', label: 'Program', icon: 'ListChecks', hue: 280 },
    { id: 'class', label: 'Class', icon: 'GraduationCap', hue: 168 },
  ];

  // The card types we fully design.
  const DESIGNED = [
    'card',
    'event',
    'experience',
    'idea',
    'memory',
    'workout',
    'workout_log',
    'program',
    'class',
  ];

  const MEMBERS = {
    you: { name: 'You', initials: 'You', color: 'hsl(0 90% 50%)' },
    TL: { name: 'Coach Tom', initials: 'TL', color: 'hsl(0 0% 35%)' },
    RS: { name: 'Rosa S.', initials: 'RS', color: 'hsl(160 70% 38%)' },
    MK: { name: 'Maya K.', initials: 'MK', color: 'hsl(243 75% 59%)' },
    JF: { name: 'Justin F.', initials: 'JF', color: 'hsl(21 90% 48%)' },
  };

  // Coach (the Persona / agent for the Ironside Strength fitness space).
  const PERSONA = { name: 'Coach', initials: 'C', role: 'Ironside Strength · AI Coach' };

  /* --- Block subtitle composer (mirrors RichWorkoutReadView) --------------- */
  function blockSubtitle(b) {
    const p = b.format_params || {};
    switch (b.block_format) {
      case 'emom':
        return `EMOM · ${p.interval_seconds || 60}s · ${p.total_minutes}\u2009min`;
      case 'amrap':
        return `AMRAP · ${p.time_cap_minutes}\u2009min`;
      case 'tabata':
        return `Tabata · ${p.work_seconds || 20}s/${p.rest_seconds || 10}s · ${p.rounds} rounds`;
      case 'superset':
        return `Superset · ${p.rounds} rounds · ${p.rest_between_rounds_seconds}s rest`;
      case 'circuit':
        return `Circuit · ${p.rounds} rounds`;
      case 'straight_sets':
        return p.rest_between_sets_seconds
          ? `Straight sets · ${p.rest_between_sets_seconds}s rest`
          : 'Straight sets';
      default:
        return null;
    }
  }

  /* --- Example records (used for the "Agent-filled" state) ----------------- */
  // `_agent` lists the field keys the Coach populated through chat.
  const RECORDS = {
    card: {
      title: 'Daily Fitness Check-in',
      description:
        "Let's start by checking in on your fitness goals. What are you hoping to achieve or work on today?",
      status: 'In progress',
      priority: 'Medium',
      assignee: 'you',
      visibility: 'private',
      live: false,
      date: '2026-06-02',
      time: '07:00',
      _agent: ['description'],
    },
    workout: {
      title: 'Friday Strength + EMOM',
      description:
        'Heavy lower primer, then a 16-minute EMOM engine builder and a short Tabata finisher.',
      status: 'Active Split',
      priority: 'High',
      assignee: 'you',
      visibility: 'private',
      live: true,
      date: '2026-06-05',
      time: '18:00',
      workout_type: 'EMOM',
      duration_min: 45,
      target_rpe: 8,
      blocks: [
        {
          name: 'Warm-up',
          instructions: [
            '5 min easy bike or row',
            'World\u2019s greatest stretch \u00d7 5 / side',
            'Banded hip openers \u00d7 10',
          ],
        },
        {
          name: 'Main',
          block_format: 'emom',
          format_params: { interval_seconds: 60, total_minutes: 16, rest_in_interval_seconds: 20 },
          exercises: [
            { name: 'Kettlebell Swing', reps: '12', note: 'Start at 0:00 each minute' },
            { name: 'Push-up', reps: '10', note: 'Alternate minutes' },
          ],
        },
        {
          name: 'Strength A',
          block_format: 'superset',
          format_params: {
            rounds: 4,
            rest_between_rounds_seconds: 90,
            pairing_notes: 'Antagonist pair',
          },
          exercises: [
            { name: 'DB Bench Press', sets: 4, reps: '8', rpe: 8 },
            { name: 'Bent-over Row', sets: 4, reps: '10', rpe: 8 },
          ],
        },
        {
          name: 'Finisher',
          block_format: 'tabata',
          format_params: { work_seconds: 20, rest_seconds: 10, rounds: 4 },
          exercises: [{ name: 'Mountain Climbers', reps: 'max', note: 'Hard effort' }],
        },
      ],
      _agent: ['description', 'workout_type', 'duration_min', 'target_rpe', 'blocks'],
    },
    workout_log: {
      title: 'Logged — Friday Strength + EMOM',
      description: 'Felt strong on the swings. Bench moved well; last superset round was a grind.',
      status: 'Logged',
      priority: 'Medium',
      assignee: 'you',
      visibility: 'private',
      live: false,
      performed_on: '2026-06-05',
      performed_time: '18:12',
      actual_duration_min: 47,
      session_rpe: 8,
      completion: 100,
      mood: '🔥',
      log: [
        {
          name: 'Kettlebell Swing',
          target: '12 reps',
          actual: '12 × 16 rounds',
          load: '24 kg',
          done: true,
        },
        {
          name: 'Push-up',
          target: '10 reps',
          actual: '10 × 16 rounds',
          load: 'bodyweight',
          done: true,
        },
        {
          name: 'DB Bench Press',
          target: '4×8 @ RPE8',
          actual: '4×8',
          load: '32.5 kg',
          done: true,
          pr: true,
        },
        { name: 'Bent-over Row', target: '4×10 @ RPE8', actual: '4×9', load: '40 kg', done: true },
        { name: 'Mountain Climbers', target: 'Tabata', actual: '4 rounds', load: '—', done: true },
      ],
      _agent: ['description', 'actual_duration_min', 'session_rpe', 'completion'],
    },
    program: {
      title: '6-Week Strength Cycle',
      description:
        'Linear strength block — three sessions a week building toward a back-squat retest in Week 6.',
      status: 'Enrolling',
      priority: 'High',
      assignee: 'TL',
      visibility: 'public',
      live: false,
      date: '2026-06-08',
      time: '',
      weeks: 6,
      days_per_week: 3,
      level: 'Intermediate',
      enrolled: 14,
      capacity: 20,
      schedule: [
        {
          week: 1,
          focus: 'Base · technique',
          sessions: [
            { day: 'Mon', title: 'Strength A — Squat', type: 'Workout' },
            { day: 'Wed', title: 'Conditioning — EMOM', type: 'Workout' },
            { day: 'Fri', title: 'Strength B — Deadlift', type: 'Workout' },
          ],
        },
        {
          week: 2,
          focus: 'Volume +',
          sessions: [
            { day: 'Mon', title: 'Strength A — Squat', type: 'Workout' },
            { day: 'Wed', title: 'Active recovery', type: 'Rest' },
            { day: 'Fri', title: 'Strength B — Press', type: 'Workout' },
          ],
        },
      ],
      _agent: ['description', 'weeks', 'days_per_week', 'schedule'],
    },
    class: {
      title: 'Sunrise Conditioning',
      description:
        'A 45-minute coached conditioning class — scalable for all levels. Online or drop in at the gym.',
      status: 'Open for signup',
      priority: 'Medium',
      assignee: 'RS',
      visibility: 'public',
      live: true,
      format: 'hybrid',
      location: 'Ironside Gym · Studio B',
      join_link: 'huddle.buddybubble.app/sunrise',
      starts: '2026-06-07T06:30',
      ends: '2026-06-07T07:15',
      recurring: 'weekly',
      days: ['Tue', 'Thu', 'Sun'],
      timezone: 'PT',
      capacity: 18,
      reserved: 11,
      price: '$0 · members',
      reminders: ['1 day before', '1 hour before'],
      instructor: 'RS',
      _agent: ['description', 'format', 'recurring', 'days'],
    },
    event: {
      title: 'Saturday Group Trail Run',
      description:
        'An easy social 5K on the river trail — all paces welcome. Coffee after at the trailhead.',
      status: 'Scheduled',
      priority: 'Medium',
      assignee: 'RS',
      visibility: 'public',
      live: false,
      location: 'Riverside Trailhead · Lot B',
      starts: '2026-06-06T08:00',
      ends: '2026-06-06T09:30',
      timezone: 'PT',
      going: 12,
      capacity: 30,
      cost: 'Free',
      bring: ['Water', 'Trail shoes', 'Layers'],
      going_people: ['RS', 'TL', 'JF', 'MK', 'you'],
      _agent: ['description', 'location', 'bring'],
    },
    experience: {
      title: 'Sunrise Summit Hike + Mobility',
      description:
        'A guided sunrise hike capped with a mobility flow at the overlook. Small group, big views.',
      status: 'Open for signup',
      priority: 'Medium',
      assignee: 'TL',
      visibility: 'public',
      live: false,
      location: 'Eagle Ridge Trailhead',
      duration_min: 150,
      group_min: 4,
      group_max: 8,
      price: '$28 · members $20',
      highlights: [
        'Catch sunrise from the ridge',
        'Guided mobility flow at the top',
        'Small group — max 8',
        'Coffee + recovery snack included',
      ],
      includes: ['Certified guide', 'Mobility session', 'Recovery snack'],
      good_for: ['All levels', 'Outdoors', 'Recovery'],
      _agent: ['description', 'highlights', 'duration_min', 'includes'],
    },
    idea: {
      title: 'Monthly community PR night',
      description:
        'A casual evening where members attempt a lift PR with the whole crew cheering. Low pressure, big energy.',
      status: 'Exploring',
      priority: 'Low',
      assignee: '',
      visibility: 'private',
      live: false,
      votes: 18,
      voted: true,
      effort: 'Low',
      impact: 'High',
      tags: ['Event idea', 'Community', 'Evening'],
      _agent: ['description', 'tags'],
    },
    memory: {
      title: 'Block Party 5K — first finish line',
      description:
        '60 neighbors showed up and 18 ran their first 5K. The cheer tunnel at the end was unreal.',
      status: 'Shared',
      priority: 'Low',
      assignee: 'you',
      visibility: 'public',
      live: false,
      happened_on: '2026-05-24',
      location: 'Riverside Park',
      people: ['JF', 'MK', 'TL', 'RS', 'you'],
      photos: 4,
      linked_event: 'Block Party',
      reactions: [
        { e: '🎉', n: 24, on: true },
        { e: '🔥', n: 12 },
        { e: '❤️', n: 31 },
      ],
      _agent: ['description'],
    },
  };

  // Empty-state defaults (what an unfilled card shows).
  const EMPTY = {
    card: {
      title: 'Daily Fitness Check-in',
      description:
        "Let's start by checking in on your fitness goals. What are you hoping to achieve or work on today?",
      status: 'In progress',
      priority: 'Medium',
      assignee: '',
      visibility: 'private',
      live: false,
      date: '',
      time: '',
    },
    workout: {
      title: 'New Workout',
      description: '',
      status: 'Draft',
      priority: 'Medium',
      assignee: '',
      visibility: 'private',
      live: false,
      date: '',
      time: '',
      workout_type: '',
      duration_min: '',
      target_rpe: '',
      blocks: [],
    },
    workout_log: {
      title: 'Workout log',
      description: '',
      status: 'Logged',
      priority: 'Medium',
      assignee: 'you',
      visibility: 'private',
      live: false,
      performed_on: '',
      performed_time: '',
      actual_duration_min: '',
      session_rpe: '',
      completion: 0,
      mood: '',
      log: [],
    },
    program: {
      title: 'New Program',
      description: '',
      status: 'Draft',
      priority: 'Medium',
      assignee: '',
      visibility: 'private',
      live: false,
      date: '',
      time: '',
      weeks: '',
      days_per_week: '',
      level: 'Beginner',
      enrolled: 0,
      capacity: '',
      schedule: [],
    },
    class: {
      title: 'New Class',
      description: '',
      status: 'Draft',
      priority: 'Medium',
      assignee: '',
      visibility: 'private',
      live: false,
      format: 'in_person',
      location: '',
      join_link: '',
      starts: '',
      ends: '',
      recurring: 'none',
      days: [],
      timezone: 'PT',
      capacity: '',
      reserved: 0,
      price: '',
      reminders: [],
      instructor: '',
    },
    event: {
      title: 'New Event',
      description: '',
      status: 'Idea',
      priority: 'Medium',
      assignee: '',
      visibility: 'private',
      live: false,
      location: '',
      starts: '',
      ends: '',
      timezone: 'PT',
      going: 0,
      capacity: '',
      cost: '',
      bring: [],
      going_people: [],
    },
    experience: {
      title: 'New Experience',
      description: '',
      status: 'Draft',
      priority: 'Medium',
      assignee: '',
      visibility: 'private',
      live: false,
      location: '',
      duration_min: '',
      group_min: '',
      group_max: '',
      price: '',
      highlights: [],
      includes: [],
      good_for: [],
    },
    idea: {
      title: 'New Idea',
      description: '',
      status: 'Spark',
      priority: 'Low',
      assignee: '',
      visibility: 'private',
      live: false,
      votes: 0,
      voted: false,
      effort: 'Medium',
      impact: 'Medium',
      tags: [],
    },
    memory: {
      title: 'New Memory',
      description: '',
      status: 'Draft',
      priority: 'Low',
      assignee: 'you',
      visibility: 'private',
      live: false,
      happened_on: '',
      location: '',
      people: [],
      photos: 0,
      linked_event: '',
      reactions: [],
    },
  };

  /* --- Status options per type -------------------------------------------- */
  const STATUS = {
    card: ['Backlog', 'In progress', 'Active Split', 'Blocked', 'Done'],
    workout: ['Draft', 'Active Split', 'Programmed', 'Completed', 'Archived'],
    workout_log: ['Logged', 'Verified', 'Flagged'],
    program: ['Draft', 'Enrolling', 'Running', 'Completed'],
    class: ['Draft', 'Open for signup', 'Full', 'In session', 'Closed'],
    event: ['Idea', 'Scheduled', 'Happening', 'Done', 'Cancelled'],
    experience: ['Draft', 'Open for signup', 'Booked', 'Completed'],
    idea: ['Spark', 'Exploring', 'Planned', 'Shipped', 'Parked'],
    memory: ['Draft', 'Shared', 'Featured'],
  };

  /* --- Strict-JSON schema text (the "spec" tab) --------------------------- */
  // What the closed-world form contract looks like for each type. Universal
  // fields are shared; each type adds/subtracts its own block.
  const SCHEMA_UNIVERSAL = `{
  "card_type": "<enum>",        // card | event | … | class
  "title": "string",
  "description": "string",
  "status": "<enum>",           // type-specific
  "priority": "low|medium|high",
  "assignee": "member_id|null",
  "visibility": "private|public",
  "live_session": boolean,
  "cover": { "preset": "string", "style_hint": "string|null" },
  "attachments": "file[]"`;

  const SCHEMA = {
    card:
      SCHEMA_UNIVERSAL +
      `,
  "scheduled_for": "date|null",
  "time": "time|null"
}`,
    workout:
      SCHEMA_UNIVERSAL +
      `,
  "scheduled_for": "date|null",
  "workout_type": "AMRAP|EMOM|TABATA|…",
  "duration_min": "int",
  "target_rpe": "number",
  // ── parametric block library ──────────────────────────
  "blocks": [{
    "name": "string",                  // Warm-up | Main | Finisher …
    "block_format": "<enum>",          // straight_sets | superset |
                                       // circuit | amrap | emom |
                                       // tabata | ladder | chipper |
                                       // pyramid | contrast | clusters |
                                       // drop_sets
    "format_params": {                 // shape depends on block_format
      "interval_seconds": "int?",
      "total_minutes": "int?",
      "time_cap_minutes": "int?",
      "rounds": "int?",
      "work_seconds": "int?",
      "rest_seconds": "int?",
      "rest_between_rounds_seconds": "int?"
    },
    "exercises": [{ "name", "sets?", "reps?",
                    "rpe?", "rest_seconds?", "note?" }],
    "instructions": "string[]?"        // instruction-only blocks
  }]
}`,
    workout_log:
      SCHEMA_UNIVERSAL +
      `,
  "performed_on": "datetime",
  "actual_duration_min": "int",
  "session_rpe": "number",            // 1–10 perceived effort
  "completion_pct": "int",
  "mood": "emoji|null",
  // ── recorded results (one row per prescribed exercise) ─
  "log": [{
    "name": "string",
    "target": "string",                // prescribed
    "actual": "string",                // performed
    "load": "string",
    "done": boolean,
    "pr": "boolean?"                   // personal record
  }]
}`,
    program:
      SCHEMA_UNIVERSAL +
      `,
  "start_date": "date",
  "weeks": "int",
  "days_per_week": "int",
  "level": "beginner|intermediate|advanced",
  "enrolled": "int",  "capacity": "int",
  // ── week-by-week schedule of linked sessions ───────────
  "schedule": [{
    "week": "int",
    "focus": "string",
    "sessions": [{
      "day": "Mon|Tue|…",
      "title": "string",
      "type": "Workout|Rest",          // links a Workout card
      "card_ref": "card_id?"
    }]
  }]
}`,
    class:
      SCHEMA_UNIVERSAL +
      `,
  // ── online / in-person fitness class ───────────────────
  "format": "online|in_person|hybrid",
  "location": "string?",               // in-person venue
  "join_link": "url?",                 // online / hybrid
  "instructor": "member_id",
  "starts": "datetime",  "ends": "datetime",
  "timezone": "string",
  "recurring": "none|daily|weekly|monthly",
  "days": "weekday[]",                 // when recurring
  "capacity": "int",  "reserved": "int",
  "price": "string",                   // "$0 · members" | "$15 drop-in"
  "reminders": "string[]",             // "1 hour before" …
  "signup": "member_id[]"
}`,
    event:
      SCHEMA_UNIVERSAL +
      `,
  // ── real-world community event / meetup ────────────────
  "location": "string",                // venue or address
  "starts": "datetime",  "ends": "datetime",
  "timezone": "string",
  "capacity": "int?",  "going": "int",
  "cost": "string",                    // "Free" | "$5 at door"
  "bring": "string[]",                 // "Water", "Trail shoes" …
  "rsvp": "member_id[]"                // who's going
}`,
    experience:
      SCHEMA_UNIVERSAL +
      `,
  // ── public, bookable shared experience ─────────────────
  "location": "string",
  "duration_min": "int",
  "group_min": "int",  "group_max": "int",
  "price": "string",
  "highlights": "string[]",            // what makes it special
  "includes": "string[]",              // what's provided
  "good_for": "string[]",              // audience tags
  "booked": "member_id[]"
}`,
    idea:
      SCHEMA_UNIVERSAL +
      `,
  // ── lightweight community idea / proposal ──────────────
  "votes": "int",                      // member interest
  "effort": "low|medium|high",
  "impact": "low|medium|high",
  "tags": "string[]",
  "promote_to": "card_type?"           // graduate to Event/Program/Class
}`,
    memory:
      SCHEMA_UNIVERSAL +
      `,
  // ── retrospective moment (social post) ─────────────────
  "happened_on": "date",
  "location": "string?",
  "people": "member_id[]",             // tagged members
  "photos": "image[]",                 // gallery
  "reactions": [{ "emoji", "count" }],
  "linked_event": "card_id?"           // the event it's from
}`,
  };

  /* --- Comments / Subtasks / Activity demo content ------------------------ */
  const COMMENTS = [
    {
      from: 'TL',
      time: 'Fri 9:02 AM',
      text: 'Pushed your bench up to 32.5 — you earned it after last week.',
      reacts: [
        { e: '🔥', n: 2, on: true },
        { e: '💪', n: 1 },
      ],
    },
    {
      from: 'you',
      time: 'Fri 9:05 AM',
      text: 'Coach — can we keep the EMOM but swap push-ups for ring rows?',
      reacts: [],
    },
    {
      from: 'C',
      persona: true,
      time: 'Fri 9:05 AM',
      text: 'Done. Main EMOM now alternates KB swings and ring rows — same 16-minute cap. Card updated.',
      reacts: [{ e: '👍', n: 1 }],
      card: 'Friday Strength + EMOM',
    },
  ];
  const SUBTASKS = [
    { txt: 'Confirm equipment: 24kg KB, dumbbells', done: true, who: 'you' },
    { txt: 'Warm-up mobility flow', done: true, who: 'you' },
    { txt: 'Complete 16-min EMOM main', done: false, who: 'you' },
    { txt: 'Log loads + session RPE', done: false, who: 'you' },
  ];
  const ACTIVITY = [
    {
      ico: 'Sparkles',
      accent: true,
      text: '<b>Coach</b> hydrated the workout — added a 16-min EMOM + Tabata finisher',
      time: 'Fri 9:05 AM',
    },
    {
      ico: 'Pencil',
      text: '<b>You</b> changed status to <b>Active Split</b>',
      time: 'Fri 9:01 AM',
    },
    {
      ico: 'Video',
      accent: true,
      text: '<b>Coach Tom</b> enabled the live Huddle session',
      time: 'Thu 4:20 PM',
    },
    {
      ico: 'Plus',
      text: '<b>You</b> created this card from the <b>wod</b> bubble',
      time: 'Thu 4:18 PM',
    },
  ];

  return {
    TYPES,
    DESIGNED,
    MEMBERS,
    PERSONA,
    RECORDS,
    EMPTY,
    STATUS,
    SCHEMA,
    COMMENTS,
    SUBTASKS,
    ACTIVITY,
    blockSubtitle,
  };
})();
