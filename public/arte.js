// Ilustraciones provisionales en SVG. Se reemplazan por las fotos reales de Don Gil.
const ARTE = {
  empanada: `<svg viewBox="0 0 120 80"><path d="M6 62C10 26 38 8 62 8s50 18 54 54c1 6-4 10-10 10H16c-6 0-11-4-10-10z" fill="#E9A23B"/><path d="M6 62C10 26 38 8 62 8s50 18 54 54" fill="none" stroke="#B8651B" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 11"/><path d="M30 54c6-14 18-22 32-22" fill="none" stroke="#F7CF7C" stroke-width="5" stroke-linecap="round"/></svg>`,
  bunuelo: `<svg viewBox="0 0 100 100"><circle cx="50" cy="52" r="42" fill="#D98A2B"/><circle cx="50" cy="50" r="42" fill="#EBA83F"/><path d="M26 40c6-12 18-18 30-16" fill="none" stroke="#F8D588" stroke-width="6" stroke-linecap="round"/><circle cx="64" cy="64" r="3" fill="#C4731F"/><circle cx="40" cy="68" r="2.500" fill="#C4731F"/><circle cx="70" cy="42" r="2" fill="#C4731F"/></svg>`,
  aborrajado: `<svg viewBox="0 0 130 80"><ellipse cx="65" cy="42" rx="58" ry="30" fill="#C97A22"/><ellipse cx="65" cy="39" rx="58" ry="30" fill="#E19A36"/><path d="M26 34c12-12 34-16 54-10" fill="none" stroke="#F6CB78" stroke-width="6" stroke-linecap="round"/><path d="M88 52c6 2 12 1 16-3" fill="none" stroke="#B8651B" stroke-width="4" stroke-linecap="round"/></svg>`,
  vaso: `<svg viewBox="0 0 80 120"><path d="M14 30h52l-7 82a6 6 0 0 1-6 6H27a6 6 0 0 1-6-6z" fill="#FFF3D6"/><path d="M17 58h46l-5 54a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6z" fill="#F29A4A"/><rect x="10" y="22" width="60" height="10" rx="5" fill="#5B1D14"/><path d="M46 22 54 2" stroke="#5B1D14" stroke-width="5" stroke-linecap="round"/></svg>`,
  taza: `<svg viewBox="0 0 100 100"><path d="M20 34h52l-6 50a8 8 0 0 1-8 7H34a8 8 0 0 1-8-7z" fill="#FFF3D6"/><rect x="24" y="52" width="44" height="18" fill="#FFCF1F"/><rect x="15" y="26" width="62" height="10" rx="5" fill="#5B1D14"/><path d="M36 16c-4-6 4-8 0-14M52 16c-4-6 4-8 0-14" fill="none" stroke="#5B1D14" stroke-width="3" stroke-linecap="round" opacity=".5"/></svg>`,
  caja: `<svg viewBox="0 0 140 110"><path d="M12 46h116v52a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8z" fill="#C98B4A"/><path d="M12 46 26 20h88l14 26z" fill="#E0A968"/><path d="M38 44c2-16 14-24 26-24s22 8 24 24z" fill="#E9A23B"/><path d="M70 44c2-12 12-18 22-18s18 6 20 18z" fill="#F0B24C"/><path d="M40 78l12-10 10 10 12-10 10 10 12-10" fill="none" stroke="#8A5524" stroke-width="3"/></svg>`,
  cono: `<svg viewBox="0 0 100 120"><path d="M22 50h56L56 114a6 6 0 0 1-12 0z" fill="#FFF3D6"/><path d="M30 62h40M34 76h32M39 90h22" stroke="#FFCF1F" stroke-width="5"/><circle cx="34" cy="38" r="18" fill="#EBA83F"/><circle cx="66" cy="38" r="18" fill="#EBA83F"/><circle cx="50" cy="24" r="18" fill="#F0B24C"/><path d="M36 20c6 8 22 8 28 0 2 8-2 14-6 12-2 8-12 8-14 0-4 2-10-4-8-12z" fill="#8A4A17"/></svg>`,
};
ARTE.combo = `<svg viewBox="0 0 160 100"><g transform="translate(0 16) scale(.82)">${ARTE.empanada.replace(/<\/?svg[^>]*>/g, "")}</g><g transform="translate(62 40) scale(.72)">${ARTE.aborrajado.replace(/<\/?svg[^>]*>/g, "")}</g></svg>`;

function pintarArte(raiz = document) {
  raiz.querySelectorAll("[data-arte]").forEach((nodo) => {
    if (!nodo.firstChild) nodo.innerHTML = ARTE[nodo.dataset.arte] ?? ARTE.empanada;
  });
}
pintarArte();
