// Generates docs/demo/annona-demo.pptx (live-demo deck).
// Run: NODE_PATH=<dir with pptxgenjs, react, react-dom, react-icons, sharp> node docs/demo/build-deck.js
// Claims on slides come from docs/MVP_SCOPE.md §5 and docs/handoffs/dev-*.md. Re-check "real vs simulated" before presenting.
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");

const SKILL = process.env.PPTX_SKILL_DIR;
const { applyTheme } = require(path.join(SKILL, "scripts/apply_theme.js"));

const THEME = {
  name: "Annona",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "17301F", lt1: "FFFFFF", dk2: "24523A", lt2: "EEF4EC",
    accent1: "2F7D4F", accent2: "E8833A", accent3: "8DBF7A", accent4: "B5413B",
    accent5: "5E7A68", accent6: "F3C969", hlink: "2F7D4F", folHlink: "5E7A68",
  },
};
const HEX = { dark: "17301F", forest: "24523A", leaf: "2F7D4F", mint: "8DBF7A", pale: "EEF4EC", apricot: "E8833A", red: "B5413B", slate: "5E7A68", white: "FFFFFF" };

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.title = "Annona live demo";
pres.author = "Annona team";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

pres.defineSlideMaster({
  title: "DARK",
  background: { color: C.text1 },
  objects: [],
  slideNumber: { x: 9.2, y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: C.accent5, align: "right" },
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background2 },
  objects: [{ placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 8.8, h: 0.8, fontSize: 30, bold: true, color: C.text2, valign: "middle", margin: 0 }, text: "" } }],
  slideNumber: { x: 9.2, y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: C.accent5, align: "right" },
});

const card = (s, x, y, w, h, name) => s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: C.background1 }, line: { color: C.background1, width: 0 }, shadow: { type: "outer", color: "17301F", opacity: 0.12, blur: 8, offset: 2, angle: 90 }, objectName: name });
const txt = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, ...o });
const circle = (s, x, y, d, color, name) => s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color }, line: { color, width: 0 }, objectName: name });

(async () => {
  const I = {
    camera: await icon(fa.FaCamera, "FFFFFF"), robot: await icon(fa.FaRobot, "FFFFFF"), user: await icon(fa.FaUserCheck, "FFFFFF"),
    gate: await icon(fa.FaShieldAlt, "FFFFFF"), sms: await icon(fa.FaCommentDots, "FFFFFF"), truck: await icon(fa.FaTruck, "FFFFFF"),
    clock: await icon(fa.FaClock, "FFFFFF"), ban: await icon(fa.FaBan, "FFFFFF"), leaf: await icon(fa.FaLeaf, "8DBF7A"), leafW: await icon(fa.FaLeaf, "FFFFFF"),
    check: await icon(fa.FaCheckCircle, "2F7D4F", 128), warn: await icon(fa.FaExclamationTriangle, "E8833A", 128), flask: await icon(fa.FaFlask, "5E7A68", 128),
  };

  // 1 Title
  pres.addSection({ title: "Open" });
  let s = pres.addSlide({ masterName: "DARK", sectionTitle: "Open" });
  s.addImage({ data: I.leaf, x: 0.7, y: 1.15, w: 0.7, h: 0.7, altText: "Annona leaf mark" });
  txt(s, "Annona", { x: 0.7, y: 1.95, w: 8, h: 1.1, fontFace: "Cambria", fontSize: 60, bold: true, color: C.background1 });
  txt(s, "Surplus food, routed responsibly.", { x: 0.7, y: 3.05, w: 8, h: 0.5, fontSize: 24, color: C.accent3 });
  txt(s, "Text a photo. A human verifies. A rule gate decides. First valid YES wins.", { x: 0.7, y: 3.75, w: 7.6, h: 0.6, fontSize: 16, color: C.background2 });
  txt(s, "DubHacks 2026  |  Community Kitchen  |  Synthetic data only", { x: 0.7, y: 4.95, w: 7, h: 0.3, fontSize: 12, color: C.accent5 });
  s.addNotes("Open with the one-line promise. Everything we show today uses synthetic donors, recipients and couriers. 20 seconds.");

  // 2 Problem
  pres.addSection({ title: "Why" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Why" });
  s.addText("Small lots fall through the cracks", { placeholder: "title" });
  const probs = [
    [I.clock, "Minutes, not days", "A licensed kitchen ends an event with refrigerated trays and a short handover window. Scheduled rescue routes may miss last-minute lots."],
    [I.camera, "A photo is not a fact", "An image cannot show ingredients, hidden allergens, cross-contact or how the food was held."],
    [I.ban, "\"Keep offering\" breaks down", "An endless offer loop can hand food over after the kitchen's cutoff or to someone who cannot receive it."],
  ];
  probs.forEach(([ic, h, b], i) => {
    const x = 0.6 + i * 3.0;
    card(s, x, 1.6, 2.8, 3.1, `problem-card-${i + 1}`);
    circle(s, x + 0.25, 1.85, 0.7, HEX.leaf, `problem-icon-bg-${i + 1}`);
    s.addImage({ data: ic, x: x + 0.43, y: 2.03, w: 0.34, h: 0.34, altText: h });
    txt(s, h, { x: x + 0.25, y: 2.7, w: 2.3, h: 0.5, fontFace: "Cambria", fontSize: 18, bold: true, color: C.text2 });
    txt(s, b, { x: x + 0.25, y: 3.25, w: 2.3, h: 1.35, fontSize: 14, color: C.text1, valign: "top" });
  });
  s.addNotes("Frame the problem as small, time-boxed, last-minute lots. Be careful: say 'may miss', this is an assumption we have not validated. 30 seconds.");

  // 3 How it works
  pres.addSection({ title: "Product" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Product" });
  s.addText("One flow, five steps", { placeholder: "title" });
  const steps = [
    [I.camera, "Photo", "Donor texts a photo"], [I.robot, "AI draft", "Gemini guesses, marked uncertain"],
    [I.user, "Verify", "Donor confirms on a checklist"], [I.gate, "Gate", "Rules allow or block"], [I.sms, "Claim", "Courier replies YES, one wins"],
  ];
  steps.forEach(([ic, h, b], i) => {
    const x = 0.6 + i * 1.78;
    circle(s, x + 0.34, 1.7, 0.9, i === 3 ? HEX.apricot : HEX.leaf, `step-icon-bg-${i + 1}`);
    s.addImage({ data: ic, x: x + 0.59, y: 1.95, w: 0.4, h: 0.4, altText: h });
    txt(s, `${i + 1}  ${h}`, { x, y: 2.85, w: 1.58, h: 0.4, fontFace: "Cambria", fontSize: 18, bold: true, color: C.text2, align: "center" });
    txt(s, b, { x, y: 3.3, w: 1.58, h: 0.9, fontSize: 14, color: C.text1, align: "center", valign: "top" });
  });
  txt(s, "The operator dashboard shows server truth at every step.", { x: 0.6, y: 4.5, w: 8.8, h: 0.4, fontSize: 14, italic: true, color: C.accent5 });
  s.addNotes("Walk left to right. The gate in the middle is deterministic code, not the AI. 30 seconds.");

  // 4 Principle
  s = pres.addSlide({ masterName: "DARK", sectionTitle: "Product" });
  txt(s, "AI describes. Humans verify. Backend enforces.", { x: 0.7, y: 0.4, w: 8.6, h: 1.1, fontFace: "Cambria", fontSize: 28, bold: true, color: C.background1, valign: "middle" });
  const pr = [
    ["AI describes", "Vision output is an editable hypothesis. Unclear photos fail closed to manual entry."],
    ["Humans verify", "Servings, ingredients, all nine major allergens and handling facts start as \"unknown\" until the donor attests."],
    ["Backend enforces", "A deterministic gate returns eligible, needs review or rejected. Unknown never means eligible."],
  ];
  pr.forEach(([h, b], i) => {
    const x = 0.7 + i * 2.95;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.8, w: 2.75, h: 2.7, rectRadius: 0.12, fill: { color: C.text2 }, line: { color: C.text2, width: 0 }, objectName: `principle-card-${i + 1}` });
    txt(s, h, { x: x + 0.25, y: 2.05, w: 2.25, h: 0.5, fontFace: "Cambria", fontSize: 20, bold: true, color: C.accent3 });
    txt(s, b, { x: x + 0.25, y: 2.65, w: 2.25, h: 1.7, fontSize: 14, color: C.background1, valign: "top" });
  });
  s.addNotes("This is the safety story. No photo or model output ever establishes food safety or allergen freedom. 30 seconds.");

  // 5-7 demo scenes
  pres.addSection({ title: "Live demo" });
  const scene = (num, title, accent, rows, note) => {
    const sl = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Live demo" });
    sl.addText(`Scene ${num}: ${title}`, { placeholder: "title" });
    rows.forEach(([who, what], i) => {
      const y = 1.5 + i * 0.78;
      card(sl, 0.6, y, 8.8, 0.66, `scene-${num}-row-${i + 1}`);
      circle(sl, 0.75, y + 0.13, 0.4, accent, `scene-${num}-num-bg-${i + 1}`);
      txt(sl, String(i + 1), { x: 0.75, y: y + 0.13, w: 0.4, h: 0.4, fontSize: 14, bold: true, color: C.background1, align: "center", valign: "middle" });
      txt(sl, who, { x: 1.35, y: y + 0.08, w: 1.9, h: 0.5, fontSize: 14, bold: true, color: C.text2, valign: "middle" });
      txt(sl, what, { x: 3.3, y: y + 0.08, w: 5.95, h: 0.5, fontSize: 14, color: C.text1, valign: "middle" });
    });
    sl.addNotes(note);
    return sl;
  };
  scene(1, "Success", HEX.leaf, [
    ["Donor phone", "Texts a photo of a refrigerated sandwich and wrap platter"],
    ["Annona", "Replies with an AI guess and a checklist link"],
    ["Donor", "Corrects servings to 24, declares all nine allergens, attests handling"],
    ["Gate", "Returns eligible under the prototype policy"],
    ["Courier A", "Gets a time-limited offer, replies YES with the code"],
    ["Dashboard", "Claimed. Operator marks simulated pickup and delivery"],
  ], "Rainier Catering (synthetic) -> Eastlake Community Pantry (synthetic). Point out the AI estimate of 18-30 servings versus the donor's 24. Fallback: same photo through web upload. Handoff steps are simulated and labeled. 90 seconds.");
  scene(2, "No response, late reply", HEX.apricot, [
    ["Courier A", "Ignores a 60-second accelerated offer"],
    ["Server tick", "Expires the offer and moves to the next candidate"],
    ["Courier B", "Accepts and wins the claim"],
    ["Courier A", "Replies late and is told no assignment was made"],
  ], "Timers are accelerated and labeled DEMO on screen. The point: deadlines are enforced by the server, and a late or repeated YES cannot create a second assignment. 45 seconds.");

  // scene 3 custom: refusal
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Live demo" });
  s.addText("Scene 3: Responsible refusal", { placeholder: "title" });
  card(s, 0.6, 1.5, 3.4, 3.2, "refusal-input-card");
  txt(s, "Attractive pasta tray", { x: 0.85, y: 1.7, w: 2.9, h: 0.4, fontFace: "Cambria", fontSize: 18, bold: true, color: C.text2 });
  ["Cooked, then cooled", "Cold holding unknown", "No temperature log", "Sesame unknown"].forEach((t, i) => {
    s.addImage({ data: I.warn, x: 0.85, y: 2.3 + i * 0.5, w: 0.26, h: 0.26, altText: "warning" });
    txt(s, t, { x: 1.25, y: 2.25 + i * 0.5, w: 2.6, h: 0.36, fontSize: 14, color: C.text1, valign: "middle" });
  });
  s.addShape(pres.ShapeType.roundRect, { x: 4.4, y: 1.5, w: 5.0, h: 3.2, rectRadius: 0.12, fill: { color: C.text2 }, line: { color: C.text2, width: 0 }, objectName: "refusal-result-card" });
  txt(s, "Gate result", { x: 4.7, y: 1.7, w: 4.4, h: 0.3, fontSize: 12, color: C.accent3 });
  txt(s, "Needs review", { x: 4.7, y: 2.0, w: 4.4, h: 0.6, fontFace: "Cambria", fontSize: 30, bold: true, color: C.background1 });
  txt(s, "Four plain-language reasons shown to the operator.\nNo offer is created.\nThere is no \"dispatch anyway\" button.", { x: 4.7, y: 2.8, w: 4.4, h: 1.6, fontSize: 16, color: C.background2, valign: "top", paraSpaceAfter: 6 });
  s.addNotes("This is the scene that earns trust. The tray looks great but the facts are unknown, so the system refuses to dispatch. Optional fourth scene: a previously served buffet tray is rejected. 45 seconds.");

  // 8 Real vs simulated
  pres.addSection({ title: "Honesty" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Honesty" });
  s.addText("What is real and what is simulated", { placeholder: "title" });
  card(s, 0.6, 1.5, 4.3, 3.2, "real-card");
  card(s, 5.1, 1.5, 4.3, 3.2, "simulated-card");
  s.addImage({ data: I.check, x: 0.85, y: 1.7, w: 0.32, h: 0.32, altText: "real" });
  txt(s, "Real calls", { x: 1.3, y: 1.7, w: 3.3, h: 0.34, fontFace: "Cambria", fontSize: 18, bold: true, color: C.text2, valign: "middle" });
  s.addText([
    { text: "Gemini vision on photos, including an iPhone HEIC", options: { bullet: true, breakLine: true } },
    { text: "Photon iMessage: JOIN round trip and photo intake", options: { bullet: true, breakLine: true } },
    { text: "Deterministic gate, matching and state machine in code with tests", options: { bullet: true } },
  ], { isTextBox: true, x: 0.85, y: 2.2, w: 3.8, h: 2.3, fontSize: 14, color: C.text1, valign: "top", margin: 0, paraSpaceAfter: 6 });
  s.addImage({ data: I.flask, x: 5.35, y: 1.7, w: 0.32, h: 0.32, altText: "simulated" });
  txt(s, "Simulated, and labeled", { x: 5.8, y: 1.7, w: 3.4, h: 0.34, fontFace: "Cambria", fontSize: 18, bold: true, color: C.text2, valign: "middle" });
  s.addText([
    { text: "All donors, recipients and couriers are synthetic", options: { bullet: true, breakLine: true } },
    { text: "Pickup and delivery handoff", options: { bullet: true, breakLine: true } },
    { text: "Accelerated 60-second offer timers", options: { bullet: true, breakLine: true } },
    { text: "Annona is a prototype, not food-safety certified", options: { bullet: true } },
  ], { isTextBox: true, x: 5.35, y: 2.2, w: 3.8, h: 2.3, fontSize: 14, color: C.text1, valign: "top", margin: 0, paraSpaceAfter: 6 });
  s.addNotes("Source: docs/handoffs/dev-1.md (Gemini on Vertex, real HEIC), dev-3.md (Photon SP-1, SP-14). BEFORE PRESENTING: confirm the real-Postgres claim race test (T-CO-17) status in PROJECT_STATE and add 'claims are race-safe' only if it passed. Update this slide if a provider ends up in fake mode on demo day.");

  // 9 Tracks / stack
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Honesty" });
  s.addText("Built for the Community Kitchen track", { placeholder: "title" });
  [["Community Kitchen", "Food-rescue coordination with safety by design"], ["Photon", "Time-limited offers and claims over iMessage"], ["Gemini API", "Photo to an uncertain, editable draft"]].forEach(([h, b], i) => {
    const y = 1.5 + i * 1.05;
    card(s, 0.6, y, 8.8, 0.9, `track-row-${i + 1}`);
    circle(s, 0.85, y + 0.2, 0.5, HEX.leaf, `track-icon-bg-${i + 1}`);
    s.addImage({ data: [I.leafW, I.sms, I.robot][i], x: 1.0, y: y + 0.35, w: 0.2, h: 0.2, altText: h });
    txt(s, h, { x: 1.7, y: y + 0.12, w: 2.6, h: 0.66, fontFace: "Cambria", fontSize: 18, bold: true, color: C.text2, valign: "middle" });
    txt(s, b, { x: 4.3, y: y + 0.12, w: 4.9, h: 0.66, fontSize: 14, color: C.text1, valign: "middle" });
  });
  s.addNotes("Only claim tracks we genuinely use. Do not add VEYZL or SideShift here unless the evidence exists (see CLAUDE.md sponsor claims). 20 seconds.");

  // 10 Close
  s = pres.addSlide({ masterName: "DARK", sectionTitle: "Honesty" });
  s.addImage({ data: I.leaf, x: 0.7, y: 1.2, w: 0.6, h: 0.6, altText: "Annona leaf mark" });
  txt(s, "Fast when it is safe. Stopped when it is not.", { x: 0.7, y: 2.0, w: 8.4, h: 1.4, fontFace: "Cambria", fontSize: 36, bold: true, color: C.background1, valign: "top" });
  txt(s, "Next: partner and food-safety review before any real deployment.", { x: 0.7, y: 3.6, w: 8.2, h: 0.5, fontSize: 18, color: C.accent3 });
  txt(s, "Thank you. Questions?", { x: 0.7, y: 4.5, w: 6, h: 0.4, fontSize: 16, color: C.background2 });
  s.addNotes("Close on the principle, restate it is a prototype with synthetic data, and invite questions.");

  const out = path.join(__dirname, "annona-demo.pptx");
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("wrote", out);
})();
