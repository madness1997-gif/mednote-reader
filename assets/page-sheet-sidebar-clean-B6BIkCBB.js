var e=`mednote-page-sheet-sidebar-clean-style`,t=`mednote-page-sheet-nav`,n=`mps-sidebar-more`,r=`mps-tools-open`,i=`onenote-note-navigation-close`,a=`mps-onenote-rail`,o=`mps-sidebar-utility`,s=`mednote-note-sidebar-recents-v1`,c=`mednote-note-sidebar-pending-v1`,l=`
/* The OneNote-style Page→Sheet navigator is the single note navigation source. */
.note-navigation-host:has(> .${t}) > .${t}{display:grid!important;visibility:visible!important;opacity:1!important}

/* OneNote-like structure: slim command rail + Sections column + Pages column. */
.workspace.onenote-right-navigation-layout{--onenote-nav-width:clamp(360px,31vw,430px)!important}
.note-navigation-host.onenote-navigation-active:has(> .${t}){width:100%!important;min-width:0!important;max-width:none!important;resize:none!important;background:#fff!important;border-left:1px solid #e2e5e7!important}
.${t}{min-height:0!important;grid-template-columns:44px minmax(0,1fr)!important;grid-template-rows:42px minmax(0,1fr)!important;background:#fff!important;color:#263238!important;overflow:hidden!important}
.${t} .mps-bookbar{grid-column:2!important;grid-row:1!important;height:42px!important;display:flex!important;align-items:center!important;gap:4px!important;padding:5px 7px!important;background:#fff!important;border-bottom:1px solid #e5e8ea!important;overflow:visible!important}
.${t} .mps-book-icon{width:24px!important;height:24px!important;border-radius:4px!important;background:#7719aa!important;color:#fff!important;font-size:9px!important}
.${t} .mps-book-select{height:30px!important;padding:0 6px!important;font-size:12px!important;color:#263238!important}
.${t} .mps-icon{width:28px!important;height:28px!important;color:#5f6368!important}
.${t} .${i}{display:grid!important;visibility:visible!important;opacity:1!important;flex:0 0 30px!important;width:30px!important;height:30px!important;margin-left:1px!important;padding:0!important;place-items:center!important;border:1px solid #dedfe2!important;border-radius:7px!important;background:#fff!important;color:#555!important;font-size:18px!important;line-height:1!important;cursor:pointer!important;box-shadow:none!important}
.${t} .${i}:hover{background:#f0f1f2!important;color:#222!important}

.${t} .${a}{grid-column:1!important;grid-row:1 / span 2!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;padding:5px 5px!important;border-right:1px solid #e2e4e6!important;background:#f7f7f8!important}
.${t} .mps-rail-button{position:relative;width:34px;height:36px;display:grid;place-items:center;margin:1px 0;border:0;border-radius:6px;background:transparent;color:#656b70;font-size:18px;line-height:1;cursor:pointer}
.${t} .mps-rail-button:hover{background:#ececef;color:#333}
.${t} .mps-rail-button.active{background:#eee7f3;color:#6f238f}
.${t} .mps-rail-button.active::before{content:"";position:absolute;left:-5px;top:5px;bottom:5px;width:3px;border-radius:0 3px 3px 0;background:#7719aa}
.${t} .mps-rail-spacer{flex:1}

.${t} .mps-layout{grid-column:2!important;grid-row:2!important;display:grid!important;grid-template-columns:128px minmax(0,1fr)!important;min-height:0!important;background:#fff!important}
.${t}[data-sidebar-mode="search"] .mps-layout,
.${t}[data-sidebar-mode="recent"] .mps-layout{display:none!important}
.${t} .mps-sections{min-width:0!important;max-height:none!important;display:flex!important;flex-direction:column!important;border-right:1px solid #dedede!important;border-bottom:0!important;background:#f4f4f5!important}
.${t} .mps-pages{min-width:0!important;display:flex!important;flex-direction:column!important;background:#fff!important}
.${t} .mps-pane-head{min-height:37px!important;padding:4px 7px!important;border-bottom:1px solid #e6e6e7!important;background:#fff!important}
.${t} .mps-pane-head strong{font-size:11px!important;text-transform:none!important;letter-spacing:0!important;color:#4b5054!important}
.${t} .mps-add{height:27px!important;padding:0 6px!important;border-radius:6px!important;color:#6d3b8f!important;font-size:11px!important}
.${t} .mps-section-list,.${t} .mps-page-list{min-height:0!important;flex:1!important;overflow:auto!important;scrollbar-width:thin!important}

.${t} .mps-section-list{display:block!important;padding:0!important}
.${t} .mps-section{position:relative!important;width:100%!important;max-width:none!important;min-height:39px!important;display:flex!important;align-items:stretch!important;margin:0!important;border:0!important;border-bottom:1px solid #e4e4e5!important;border-radius:0!important;background:transparent!important;overflow:visible!important}
.${t} .mps-section::before{width:5px!important;align-self:stretch!important;border-radius:0!important}
.${t} .mps-section-copy{min-width:0!important;flex:1!important;display:block!important;padding:11px 6px!important}
.${t} .mps-section-copy strong{display:block!important;max-width:none!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:11px!important;font-weight:600!important;color:#333!important}
.${t} .mps-section-copy small{display:none!important}
.${t} .mps-section.active{border-color:#e4e4e5!important;background:#fff!important;box-shadow:none!important}
.${t} .mps-section.active .mps-section-copy strong{font-weight:750!important;color:#222!important}
.${t} .mps-section:hover{background:#e9e9ea!important}

.${t} .mps-page-list{padding:0!important;background:#fff!important}
.${t} .mps-page-card{position:relative!important;margin:0!important;border:0!important;border-bottom:1px solid #ececee!important;border-radius:0!important;background:#fff!important;overflow:visible!important}
.${t} .mps-page-card.active{border-color:#ececee!important;background:#eee7f3!important;box-shadow:inset 3px 0 #7719aa!important}
.${t} .mps-page-head{min-height:41px!important;padding-right:3px!important}
.${t} .mps-page-open{padding:9px 8px 9px 11px!important}
.${t} .mps-page-open strong{font-size:12px!important;font-weight:600!important;color:#303438!important}
.${t} .mps-page-open small{display:none!important}
.${t} .mps-page-card:hover{background:#f4f4f5!important}

.${t} .mps-sheets{margin:0 7px 7px 16px!important;padding:2px 0 2px 7px!important;border-left:1px solid #d8c9e3!important;background:transparent!important}
.${t} .mps-sheet{position:relative!important;min-height:29px!important;border-top:0!important;border-radius:5px!important}
.${t} .mps-sheet+.mps-sheet{margin-top:2px!important}
.${t} .mps-sheet.active{background:#e5dced!important}
.${t} .mps-sheet-open{padding:6px 7px!important;font-size:10.5px!important;color:#575d61!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
.${t} .mps-sheet.active .mps-sheet-open{color:#5d2b79!important}

/* Keep item actions available without visual clutter. */
.${t} .mps-page-tools,
.${t} .mps-sheet-tools,
.${t} .mps-section-actions{display:none!important;position:absolute!important;z-index:30!important;gap:2px!important;padding:3px!important;border:1px solid #dfe4e6!important;border-radius:8px!important;background:#fff!important;box-shadow:0 7px 22px #24323a26!important}
.${t} .mps-page-card.${r} .mps-page-tools{display:flex!important;top:34px!important;right:4px!important}
.${t} .mps-sheet.${r} .mps-sheet-tools{display:flex!important;top:25px!important;right:2px!important}
.${t} .mps-section.${r} .mps-section-actions{display:flex!important;top:31px!important;right:2px!important}
.${t} .mps-mini{width:25px!important;height:25px!important;border-radius:6px!important;font-size:11px!important}
.${t} .${n}{flex:0 0 auto;width:26px;height:26px;margin-right:3px;border:0;border-radius:6px;background:transparent;color:#727b80;font-size:16px;line-height:1;cursor:pointer}
.${t} .${n}:hover,.${t} .${n}:focus-visible{background:#eceff1;color:#343a3e;outline:none}
.${t} .mps-section>.${n}{width:22px;height:26px;margin:auto 2px auto 0;font-size:14px}
.${t} .mps-sheet>.${n}{width:22px;height:23px;margin-right:1px;font-size:14px}

/* Search / Recent Notes occupy the same content area; no fake buttons. */
.${t} .${o}{grid-column:2!important;grid-row:2!important;min-height:0!important;display:none!important;flex-direction:column!important;background:#fff!important}
.${t}[data-sidebar-mode="search"] .${o},.${t}[data-sidebar-mode="recent"] .${o}{display:flex!important}
.${t} .mps-utility-head{min-height:39px;display:flex;align-items:center;gap:7px;padding:6px 8px;border-bottom:1px solid #e5e6e7;background:#fafafa}
.${t} .mps-utility-head strong{min-width:0;flex:1;font-size:12px;color:#383d41}
.${t} .mps-search-input{width:100%;height:33px;padding:0 10px;border:1px solid #d4d7d9;border-radius:7px;background:#fff;color:#2e3337;font-size:12px;outline:none}
.${t} .mps-search-input:focus{border-color:#9d6bb6;box-shadow:0 0 0 2px #efe6f4}
.${t} .mps-utility-body{min-height:0;flex:1;overflow:auto;padding:6px;background:#fff}
.${t} .mps-utility-empty{padding:28px 12px;color:#858b8f;text-align:center;font-size:11px;line-height:1.5}
.${t} .mps-utility-result{width:100%;min-height:38px;display:flex;align-items:center;gap:8px;padding:8px 9px;border:0;border-radius:6px;background:transparent;text-align:left;cursor:pointer}
.${t} .mps-utility-result:hover{background:#f1f1f2}
.${t} .mps-utility-dot{width:6px;height:24px;flex:0 0 6px;border-radius:4px;background:#b7a0c4}
.${t} .mps-utility-result span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;color:#34393c}
.${t} .mps-utility-result small{flex:0 0 auto;color:#9a9da0;font-size:9px}

@media(max-width:900px){.workspace.onenote-right-navigation-layout{--onenote-nav-width:350px!important}.${t} .mps-layout{grid-template-columns:116px minmax(0,1fr)!important}}
@media(max-width:650px){
  .workspace.onenote-right-navigation-layout{--onenote-nav-width:300px!important}
  .${t}{grid-template-columns:40px minmax(0,1fr)!important}
  .${t} .${a}{padding-left:3px!important;padding-right:3px!important}
  .${t} .mps-rail-button{width:33px!important}
  .${t} .mps-layout{grid-template-columns:96px minmax(0,1fr)!important}
  .${t} .mps-section-copy{padding-left:5px!important;padding-right:4px!important}
  .${t} .mps-page-open strong{font-size:11px!important}
  .${t} .${i}{flex-basis:30px!important;width:30px!important;height:30px!important}
}
`;function u(){if(document.getElementById(e))return;let t=document.createElement(`style`);t.id=e,t.textContent=l,document.head.append(t)}function d(e){return e.replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function f(){try{let e=JSON.parse(localStorage.getItem(s)||`[]`);return Array.isArray(e)?e.filter(e=>e&&e.title&&e.value).slice(0,14):[]}catch{return[]}}function p(e){localStorage.setItem(s,JSON.stringify(e.slice(0,14)))}function m(e){return e.querySelector(`[data-notebook-select]`)?.value||``}function h(e){return e.querySelector(`.mps-section.active`)?.dataset.openSection||``}function g(e,t){let n=t.closest(`[data-open-page]`),r=t.closest(`[data-open-sheet]`);if(!n&&!r)return;let i=r?`sheet`:`page`,a=r?.dataset.openSheet||n?.dataset.openPage||``,o=(r?.textContent||n?.querySelector(`strong`)?.textContent||n?.textContent||``).trim();if(!a||!o)return;let s={notebookId:m(e),sectionId:h(e),kind:i,value:a,title:o,openedAt:Date.now()},c=`${s.notebookId}|${s.sectionId}|${s.kind}|${s.value}`;p([s,...f().filter(e=>`${e.notebookId}|${e.sectionId}|${e.kind}|${e.value}`!==c)])}function _(e){let t=e.dataset.sidebarMode;return t===`search`||t===`recent`?t:`navigation`}function v(e){let t=_(e);e.querySelectorAll(`.${a} [data-sidebar-mode-button]`).forEach(e=>{let n=e.dataset.sidebarModeButton===t;e.classList.toggle(`active`,n),e.setAttribute(`aria-pressed`,n?`true`:`false`)})}function y(e,t){e.dataset.sidebarMode=t,v(e),w(e),t===`search`&&requestAnimationFrame(()=>e.querySelector(`.mps-search-input`)?.focus())}function b(e){if(e.querySelector(`:scope > .${a}`))return;let t=document.createElement(`nav`);t.className=a,t.setAttribute(`aria-label`,`Điều hướng ghi chú`),t.innerHTML=`
    <button type="button" class="mps-rail-button active" data-sidebar-mode-button="navigation" title="Điều hướng" aria-label="Điều hướng" aria-pressed="true">▥</button>
    <button type="button" class="mps-rail-button" data-sidebar-mode-button="search" title="Tìm kiếm ghi chú" aria-label="Tìm kiếm ghi chú" aria-pressed="false">⌕</button>
    <button type="button" class="mps-rail-button" data-sidebar-mode-button="recent" title="Ghi chú gần đây" aria-label="Ghi chú gần đây" aria-pressed="false">◷</button>
    <span class="mps-rail-spacer"></span>`,e.prepend(t)}function x(e){let t=e.querySelector(`:scope > .${o}`);return t||(t=document.createElement(`section`),t.className=o,e.append(t)),t}function S(e,t){let n=t.trim().toLocaleLowerCase(`vi`);if(!n)return[];let r=[];return e.querySelectorAll(`.mps-section[data-open-section]`).forEach(e=>{let t=(e.querySelector(`strong`)?.textContent||``).trim();t.toLocaleLowerCase(`vi`).includes(n)&&r.push({kind:`section`,value:e.dataset.openSection||``,title:t})}),e.querySelectorAll(`.mps-page-open[data-open-page]`).forEach(e=>{let t=(e.querySelector(`strong`)?.textContent||``).trim();t.toLocaleLowerCase(`vi`).includes(n)&&r.push({kind:`page`,value:e.dataset.openPage||``,title:t})}),e.querySelectorAll(`.mps-sheet-open[data-open-sheet]`).forEach(e=>{let t=(e.textContent||``).trim();t.toLocaleLowerCase(`vi`).includes(n)&&r.push({kind:`sheet`,value:e.dataset.openSheet||``,title:t})}),r.slice(0,40)}function C(e,t,n){let r=S(e,t.value);n.innerHTML=r.length?r.map(e=>`<button type="button" class="mps-utility-result" data-search-open-kind="${e.kind}" data-search-open-value="${d(e.value)}"><i class="mps-utility-dot"></i><span>${d(e.title)}</span><small>${e.kind===`section`?`Section`:e.kind===`sheet`?`Tờ`:`Page`}</small></button>`).join(``):`<div class="mps-utility-empty">${t.value.trim()?`Không tìm thấy tên phù hợp trong phần đang hiển thị.`:`Nhập tên Section, Page hoặc tờ để tìm.`}</div>`}function w(e){let t=x(e),n=_(e);if(n===`navigation`){t.innerHTML=``;return}if(n===`search`){t.innerHTML=`<div class="mps-utility-head"><strong>Tìm kiếm</strong></div><div style="padding:7px 8px;border-bottom:1px solid #ececee"><input class="mps-search-input" type="search" placeholder="Tìm theo tên…" aria-label="Tìm ghi chú"></div><div class="mps-utility-body"></div>`;let n=t.querySelector(`.mps-search-input`),r=t.querySelector(`.mps-utility-body`);C(e,n,r),n.addEventListener(`input`,()=>C(e,n,r));return}let r=f();t.innerHTML=`<div class="mps-utility-head"><strong>Ghi chú gần đây</strong></div><div class="mps-utility-body">${r.length?r.map((e,t)=>`<button type="button" class="mps-utility-result" data-recent-index="${t}"><i class="mps-utility-dot"></i><span>${d(e.title)}</span><small>${e.kind===`sheet`?`Tờ`:`Page`}</small></button>`).join(``):`<div class="mps-utility-empty">Chưa có ghi chú gần đây.</div>`}</div>`}function T(e){let t=e.querySelector(`:scope > .mps-bookbar`);if(!t||t.querySelector(`.${i}`))return;let n=document.createElement(`button`);n.type=`button`,n.className=i,n.dataset.noteNavigationClose=`1`,n.title=`Ẩn sidebar note`,n.setAttribute(`aria-label`,`Ẩn sidebar note`),n.textContent=`×`,t.append(n)}function E(e,t){if(e.querySelector(`:scope > .${n}`)||e.querySelector(`:scope > .mps-page-head > .${n}`))return;let r=e.querySelector(t);if(!r||!r.children.length)return;let i=document.createElement(`button`);i.type=`button`,i.className=n,i.dataset.sidebarMore=`1`,i.setAttribute(`aria-label`,`Thêm thao tác`),i.title=`Thêm thao tác`,i.textContent=`⋯`,e.matches(`.mps-page-card`)?e.querySelector(`:scope > .mps-page-head`)?.insertBefore(i,r):e.insertBefore(i,r)}function D(e,t,n){return t===`sheet`?Array.from(e.querySelectorAll(`[data-open-sheet]`)).find(e=>e.dataset.openSheet===n):Array.from(e.querySelectorAll(`[data-open-page]`)).find(e=>e.dataset.openPage===n)}function O(e){let t=null;try{t=JSON.parse(sessionStorage.getItem(c)||`null`)}catch{t=null}if(!t)return;let n=m(e);if(t.notebookId&&n!==t.notebookId){let n=e.querySelector(`[data-notebook-select]`);n&&Array.from(n.options).some(e=>e.value===t.notebookId)?(n.value=t.notebookId,n.dispatchEvent(new Event(`change`,{bubbles:!0}))):sessionStorage.removeItem(c);return}let r=h(e);if(t.sectionId&&r!==t.sectionId){let n=Array.from(e.querySelectorAll(`[data-open-section]`)).find(e=>e.dataset.openSection===t.sectionId);n?n.click():sessionStorage.removeItem(c);return}let i=D(e,t.kind,t.value);if(!i){sessionStorage.removeItem(c);return}sessionStorage.removeItem(c),i.click()}function k(e,t){sessionStorage.setItem(c,JSON.stringify(t)),O(e)}function A(e,t,n){let r=t===`section`?`[data-open-section]`:t===`sheet`?`[data-open-sheet]`:`[data-open-page]`,i=t===`section`?`openSection`:t===`sheet`?`openSheet`:`openPage`;Array.from(e.querySelectorAll(r)).find(e=>e.dataset[i]===n)?.click()}function j(e){e.dataset.cleanSidebar=`1`,e.dataset.sidebarMode||(e.dataset.sidebarMode=`navigation`);let t=e.parentElement;if(t?.classList.contains(`note-navigation-host`)){let e=t.querySelector(`:scope > .onenote-note-navigation`);e&&(e.style.setProperty(`display`,`none`,`important`),e.style.setProperty(`visibility`,`hidden`,`important`),e.style.setProperty(`pointer-events`,`none`,`important`),e.setAttribute(`aria-hidden`,`true`))}b(e),T(e),e.querySelectorAll(`[data-add-sheet]`).forEach(e=>e.remove()),e.querySelectorAll(`.mps-page-card`).forEach(e=>E(e,`:scope > .mps-page-head > .mps-page-tools`)),e.querySelectorAll(`.mps-sheet`).forEach(e=>E(e,`:scope > .mps-sheet-tools`)),e.querySelectorAll(`.mps-section`).forEach(e=>E(e,`:scope > .mps-section-actions`)),v(e),_(e)!==`navigation`&&!e.querySelector(`:scope > .${o}`)?.children.length&&w(e),O(e)}function M(e){document.querySelectorAll(`.${t} .${r}`).forEach(t=>{t!==e&&t.classList.remove(r)})}function N(e){let i=e.target,a=i?.closest(`.${t}`);if(a){let t=i?.closest(`[data-sidebar-mode-button]`);if(t){e.preventDefault(),e.stopImmediatePropagation(),y(a,t.dataset.sidebarModeButton);return}let n=i?.closest(`[data-search-open-kind][data-search-open-value]`);if(n){e.preventDefault(),e.stopImmediatePropagation(),A(a,n.dataset.searchOpenKind||`page`,n.dataset.searchOpenValue||``);return}let r=i?.closest(`[data-recent-index]`);if(r){e.preventDefault(),e.stopImmediatePropagation();let t=f()[Number(r.dataset.recentIndex)];t&&k(a,t);return}i?.closest(`[data-open-page],[data-open-sheet]`)&&g(a,i)}let o=i?.closest(`.${t} .${n}[data-sidebar-more]`);if(o){e.preventDefault(),e.stopImmediatePropagation();let t=o.closest(`.mps-page-card,.mps-sheet,.mps-section`);if(!t)return;let n=!t.classList.contains(r);M(t),t.classList.toggle(r,n);return}i?.closest(`.${t} .mps-page-tools,.${t} .mps-sheet-tools,.${t} .mps-section-actions`)||M()}var P=!1;function F(){P||(P=!0,requestAnimationFrame(()=>{P=!1,document.querySelectorAll(`.${t}`).forEach(j)}))}u(),window.addEventListener(`click`,N,!0),new MutationObserver(F).observe(document.documentElement,{childList:!0,subtree:!0}),document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,F,{once:!0}):F(),window.setInterval(F,900);