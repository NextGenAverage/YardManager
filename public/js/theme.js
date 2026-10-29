// Color theme, remembered on this device. Loaded as a plain script at the top
// of each page, so the theme is set before anything is drawn (no flash of the
// default colors). The themes themselves are at the end of css/yard.css.
(function () {
  const KEY = "yard-theme";
  const THEMES = { classic: "Classic", pink: "💖 Pink", ocean: "🌊 Ocean", retro: "👾 Retro" };

  function apply(theme) {
    if (theme && theme !== "classic" && THEMES[theme]) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }

  let saved = "classic";
  try { saved = localStorage.getItem(KEY) || "classic"; } catch {}
  apply(saved);

  // The picker (<select id="theme-pick">), on pages that have one.
  document.addEventListener("DOMContentLoaded", () => {
    const pick = document.getElementById("theme-pick");
    if (!pick) return;
    pick.innerHTML = Object.entries(THEMES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    pick.value = THEMES[saved] ? saved : "classic";
    pick.onchange = () => {
      apply(pick.value);
      try { localStorage.setItem(KEY, pick.value); } catch {}
    };
  });
})();
