var e=`mednote-page-sheet-sidebar-functional-only-style`,t=`mednote-page-sheet-nav`,n=`mps-sidebar-search-button`,r=`mps-sidebar-search-close`,i=`
/* Keep the OneNote-like Notebook -> Section -> Page hierarchy. Search is the
   only utility control kept because it has a real, complete interaction. */
.${t}{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:42px minmax(0,1fr)!important}
.${t}>.mps-onenote-rail{display:none!important}
.${t} .mps-bookbar{grid-column:1!important;grid-row:1!important}
.${t} .mps-layout{grid-column:1!important;grid-row:2!important;display:grid!important}
.${t}[data-sidebar-mode="search"] .mps-layout{display:none!important}
.${t}[data-sidebar-mode="recent"] .mps-layout{display:grid!important}
.${t}>.mps-sidebar-utility{grid-column:1!important;grid-row:2!important}
.${t}[data-sidebar-mode="navigation"]>.mps-sidebar-utility,
.${t}[data-sidebar-mode="recent"]>.mps-sidebar-utility{display:none!important}
.${t}[data-sidebar-mode="search"]>.mps-sidebar-utility{display:flex!important}
.workspace.onenote-right-navigation-layout{--onenote-nav-width:clamp(315px,28vw,390px)!important}

.${t} .${n}{flex:0 0 30px!important;width:30px!important;height:30px!important;display:grid!important;place-items:center!important;border:0!important;border-radius:7px!important;background:transparent!important;color:#5f6368!important;font-size:17px!important;cursor:pointer!important;touch-action:manipulation!important;pointer-events:auto!important}
.${t} .${n}:hover{background:#eeeeef!important;color:#333!important}
.${t}[data-sidebar-mode="search"] .${n}{background:#eee7f3!important;color:#6f238f!important}
.${t} .${r}{width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:#666;font-size:18px;cursor:pointer;touch-action:manipulation}
.${t} .${r}:hover{background:#ececee;color:#222}

/* Every visible top-bar action must remain clickable. */
.${t} .mps-bookbar>button,
.${t} .mps-bookbar>select{pointer-events:auto!important;touch-action:manipulation!important}
.${t} .mps-notebook-menu button{pointer-events:auto!important;touch-action:manipulation!important}

/* Names are the main UI. Actions remain behind one real ellipsis menu. */
.${t} .mps-page-tools,
.${t} .mps-sheet-tools,
.${t} .mps-section-actions{max-width:min(230px,calc(100vw - 24px))}
.${t} button[disabled]{display:none!important}

@media(max-width:900px){.workspace.onenote-right-navigation-layout{--onenote-nav-width:310px!important}}
@media(max-width:650px){.workspace.onenote-right-navigation-layout{--onenote-nav-width:275px!important}}
`;function a(){if(document.getElementById(e))return;let t=document.createElement(`style`);t.id=e,t.textContent=i,document.head.append(t)}function o(e){let t=e.querySelector(`:scope > .mps-bookbar`);if(!t||t.querySelector(`.${n}`))return;let r=document.createElement(`button`);r.type=`button`,r.className=`mps-icon ${n}`,r.dataset.sidebarModeButton=`search`,r.title=`Tìm kiếm ghi chú`,r.setAttribute(`aria-label`,`Tìm kiếm ghi chú`),r.setAttribute(`aria-pressed`,`false`),r.textContent=`⌕`;let i=t.querySelector(`[data-page-sheet-notebook-more]`),a=t.querySelector(`[data-note-navigation-close]`);i?t.insertBefore(r,i):a?t.insertBefore(r,a):t.append(r)}function s(e){if(e.dataset.sidebarMode!==`search`)return;let t=e.querySelector(`:scope > .mps-sidebar-utility .mps-utility-head`);if(!t||t.querySelector(`.${r}`)||t.querySelector(`[data-native-note-search-close]`))return;let n=document.createElement(`button`);n.type=`button`,n.className=r,n.dataset.sidebarModeButton=`navigation`,n.title=`Đóng tìm kiếm`,n.setAttribute(`aria-label`,`Đóng tìm kiếm`),n.textContent=`×`,t.append(n)}function c(e){let t=e.querySelectorAll(`.mps-section[data-open-section]`).length;e.querySelectorAll(`[data-move-page]`).forEach(e=>{t<=1&&e.remove()}),e.querySelectorAll(`.mps-sheets`).forEach(e=>{let t=Array.from(e.querySelectorAll(`:scope > .mps-sheet`));t.forEach((e,n)=>{n===0&&e.querySelector(`[data-sheet-up]`)?.remove(),n===t.length-1&&e.querySelector(`[data-sheet-down]`)?.remove()})})}function l(e){e.dataset.sidebarMode!==`search`&&(e.dataset.sidebarMode=`navigation`),e.querySelector(`:scope > .mps-onenote-rail`)?.remove(),e.dataset.sidebarMode===`navigation`&&e.querySelector(`:scope > .mps-sidebar-utility`)?.remove(),o(e),s(e),c(e)}var u=!1;function d(){u||(u=!0,requestAnimationFrame(()=>{u=!1,document.querySelectorAll(`.${t}`).forEach(l)}))}a(),new MutationObserver(d).observe(document.documentElement,{childList:!0,subtree:!0}),document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,d,{once:!0}):d(),window.setInterval(d,900);