/**
 * Reusable subtitle style presets for burned-in subtitles.
 * These map to libass "force_style" fields consumed by the ffmpeg
 * "subtitles" filter in src/services/ffmpeg.service.js.
 *
 * Colors are in ASS format: &HAABBGGRR (alpha, blue, green, red - hex).
 * &H00FFFFFF = fully opaque white. &H00000000 = fully opaque black.
 */

const defaultStyle = {
  fontName: 'DejaVu Sans',
  fontSize: 64,
  primaryColour: '&H00FFFFFF', // white text
  outlineColour: '&H00000000', // black outline
  borderStyle: 1, // outline + drop shadow
  outline: 3,
  shadow: 0,
  alignment: 2, // bottom-center
  marginV: 120
};

const boldYellowStyle = {
  ...defaultStyle,
  fontName: 'DejaVu Sans Bold',
  primaryColour: '&H0000FFFF', // yellow
  outline: 4
};

const minimalStyle = {
  ...defaultStyle,
  fontSize: 52,
  outline: 2,
  marginV: 90
};

module.exports = {
  defaultStyle,
  boldYellowStyle,
  minimalStyle
};
