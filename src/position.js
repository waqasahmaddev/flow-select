const GAP_PX = 6;
const MARGIN_PX = 8;
const MIN_HEIGHT_PX = 120;

function viewport() {
  const visual = window.visualViewport;
  if (visual) {
    return { top: visual.offsetTop, left: visual.offsetLeft, width: visual.width, height: visual.height };
  }
  return { top: 0, left: 0, width: document.documentElement.clientWidth, height: window.innerHeight };
}

export function positionPopover(popover, anchor, { matchWidth, rtl }) {
  const rect = anchor.getBoundingClientRect();
  const view = viewport();
  const style = popover.style;
  const below = view.top + view.height - rect.bottom - GAP_PX - MARGIN_PX;
  const above = rect.top - view.top - GAP_PX - MARGIN_PX;

  style.setProperty('--fs-anchor-width', `${rect.width}px`);
  style.setProperty('--fs-available-height', `${Math.max(MIN_HEIGHT_PX, below, above)}px`);
  if (matchWidth) {
    style.width = `${rect.width}px`;
  }
  const natural = popover.offsetHeight;
  const width = popover.offsetWidth;

  const placeBelow = natural <= below || below >= above;
  const available = Math.max(MIN_HEIGHT_PX, placeBelow ? below : above);
  const height = Math.min(natural, available);
  const top = placeBelow ? rect.bottom + GAP_PX : rect.top - GAP_PX - height;
  const preferred = rtl ? rect.right - width : rect.left;
  const left = Math.max(view.left + MARGIN_PX, Math.min(preferred, view.left + view.width - MARGIN_PX - width));

  style.setProperty('--fs-available-height', `${available}px`);
  style.top = `${Math.round(top)}px`;
  style.left = `${Math.round(left)}px`;
  popover.dataset.placement = placeBelow ? 'bottom' : 'top';
}
