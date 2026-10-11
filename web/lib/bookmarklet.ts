// The "Save to Cheaper Eats" bookmarklet: a bookmark that runs on the page you're
// viewing (e.g. a DoorDash or Uber Eats menu). It reads the dish names and prices
// shown on your screen and opens Cheaper Eats in a new tab to confirm and save them.
// No bots and no logins: it only reads the page you already have open.

const SCRIPT = `
(function () {
  var PRICE = /^\\$\\s?(\\d{1,3}(?:,\\d{3})?(?:\\.\\d{2})?)$/;
  var ANY_PRICE = /\\$\\s?\\d/;
  var items = [], seen = {};
  var nodes = document.querySelectorAll("body *");
  for (var n = 0; n < nodes.length; n++) {
    var el = nodes[n];
    if (el.children.length) continue;
    var m = (el.textContent || "").trim().match(PRICE);
    if (!m) continue;
    var c = el;
    for (var up = 0; up < 6 && c; up++) {
      c = c.parentElement;
      if (!c || c.querySelector("input, select, textarea")) break; // filters and forms aren't dishes
      var lines = (c.innerText || "").split("\\n").map(function (s) { return s.trim(); }).filter(Boolean);
      var name = null, desc = "";
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        if (ANY_PRICE.test(l) || l.length < 3) continue;
        if (!name && l.length <= 80) { name = l; continue; }
        if (name && !desc && l.length >= 20) desc = l;
      }
      if (name) {
        var key = name + "|" + m[1];
        if (!seen[key]) {
          seen[key] = 1;
          items.push({ name: name.slice(0, 120), price: parseFloat(m[1].replace(",", "")), desc: desc.slice(0, 200) });
        }
        break;
      }
    }
  }
  if (!items.length) { alert("Cheaper Eats couldn't find any prices on this page. Open a restaurant's menu first."); return; }
  var data = { url: location.href, title: document.title, items: items.slice(0, 400) };
  window.open("__ORIGIN__/save#" + encodeURIComponent(JSON.stringify(data)), "_blank");
})();`;

/** The bookmark's address (a javascript: link) for the given site origin. */
export function bookmarkletHref(origin: string): string {
  const code = SCRIPT.replace("__ORIGIN__", origin).replace(/\n\s*/g, " ");
  return `javascript:${encodeURIComponent(code)}`;
}

/** Which app a saved page came from, from its web address. */
export function appFromUrl(url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (host.includes("doordash")) return "doordash";
  if (host.includes("ubereats")) return "ubereats";
  if (host.includes("grubhub")) return "grubhub";
  if (host.includes("postmates")) return "postmates";
  if (host.includes("seamless")) return "seamless";
  return host.split(".")[0] || "website";
}

export const APP_LABELS: Record<string, string> = {
  doordash: "DoorDash",
  ubereats: "Uber Eats",
  grubhub: "Grubhub",
  postmates: "Postmates",
  seamless: "Seamless",
};
