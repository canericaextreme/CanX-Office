# Brain shelf correction — local verification limits

The correction reconstructed on main e2018fe preserves the existing wooden shelf sides/base, perspective, shadows and 28px depth / 6px upward shelf-face motion. Reduced motion removes shelf transforms and synopsis animation.

Synopses now overlay their own shelf boxes with an inset local container. Entry pointer coordinates freeze the animation origin; no pointer-move listener repositions the bubble. The 180ms opacity/scale entrance stays inside the box. Escape, keyboard focus transfer/return, touch toggle, pointer exit and full-contents opening have fixture interaction coverage.

No new screenshots or browser/device visual verification were performed. Check the actual shelf geometry, animation, scrolling and native chooser button on desktop and narrow/touch screens. The native chooser window is controlled by the operating system. See ../brain-shelf-bubbles-draft-pr.md for the focused local draft and final check results. This is not signed-in Office health evidence.
