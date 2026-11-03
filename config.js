// App settings. Fill these in before you publish — see README.md, "Turn on live sync".
window.YSR_APP = true;
window.YSR_CONFIG = {
  // Supabase project (free tier is fine to start). Leave blank and the app runs on-device only.
  supabaseUrl: "https://pofizgaylnieoseglklo.supabase.co",       // e.g. "https://abcdxyz.supabase.co"
  supabaseAnonKey: "sb_publishable_LBewxAVRqCGIub4hpxaNmw_TQcX0EPB",   // the project's public "anon" key (safe to ship in the app)

  // How many people must report the same final score before it counts in the rankings.
  // The person who kept score counts as one. 2 = scorekeeper + one other parent or coach.
  confirmationsRequired: 2,

  // Licensed data feed (e.g. from GotSport, once you have a written agreement).
  // A URL returning JSON in the format described in README.md, "Plugging in a licensed feed".
  feedUrl: ""
};
