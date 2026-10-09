// iPhone Duo as a web page sees it, in CSS pixels. Apple hasn't published
// these: they are the third-party figures worked out from the hardware specs
// (outer 466 × 678, inner 890 × 626 at 3x). Change them here when Apple does.
export const DUO = {
  folded: { width: 466, height: 678 },
  open: { width: 890, height: 626 },
  deviceScaleFactor: 3,
  // The crease runs top to bottom through the middle of the open screen.
  foldX: 445,
  // How far either side of the crease counts as "on the fold".
  foldBand: 10,
};

export const SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1';

// Apple's minimum comfortable tap target, in points (= CSS pixels here).
export const MIN_TAP = 44;
// Narrower than this in either direction is too small even when long.
export const MIN_TAP_EDGE = 24;
