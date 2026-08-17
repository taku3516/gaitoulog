// ===================================================================
//  配色トークン（単一の出所）
//
//  出典: デジタル庁デザインシステム（DADS）のプリミティブカラー。
//        値は npm パッケージ @digital-go-jp/design-tokens v2.0.1 の
//        dist/tokens-simple.css に定義されたものをそのまま使う。
//
//  ここを唯一の定義場所とし、画面（style.css）・グラフ（dashboard.js）・
//  共有画像（share-report.js / report.js）・地図（activity-map.js）が
//  同じ値を参照する。以前は5か所に別々の16進値が書かれており、
//  画面とシェア画像で色がずれていた。
//
//  グレーの 420 / 536 という半端な段階は DADS が意図的に用意したもので、
//  白背景に対するコントラスト比がそれぞれ 3:1（UI部品の境界の下限）と
//  4.5:1（本文テキストの下限）にあたる。薄くしたいときもこの段階より
//  下げない。
//
//  ただし補助テキスト（inkMuted）は白だけでなく sunken(#f2f2f2) の上にも
//  出るため、白基準ぎりぎりの gray-536 では地がグレーのときに 4.06:1 まで
//  落ちる。1段濃い gray-600 を既定にしている。
// ===================================================================

/** DADS プリミティブカラー（必要な段階だけ抜粋） */
export const PRIMITIVE = {
    white: '#ffffff',

    // Solid Gray
    gray50: '#f2f2f2',
    gray100: '#e6e6e6',
    gray200: '#cccccc',
    gray300: '#b3b3b3',
    gray420: '#949494', // 白背景に対して 3:1
    gray500: '#7f7f7f',
    gray536: '#767676', // 白背景に対して 4.5:1
    gray600: '#666666', // sunken(#f2f2f2) の上でも 4.5:1 を満たす
    gray700: '#4d4d4d',
    gray900: '#1a1a1a',

    // Blue（主色。順序のあるデータの濃淡にも使う）
    blue50: '#e8f1fe',
    blue200: '#c5d7fb',
    blue400: '#7096f8',
    blue700: '#264af4',
    blue900: '#0017c1',
    blue1000: '#00118f',

    // 系列を分けるための色。青との判別が色覚特性によらず付く組み合わせに絞る
    cyan1000: '#006173',
    green800: '#197a4b',
    orange800: '#c74700', // グラフの系列色（白地の上で使う）
    orange900: '#ac3e00', // 注意の文字色（薄いオレンジの地の上でも 4.5:1）
    red900: '#ce0000',
};

/** 画面・画像で共通に使う意味づけ済みの色 */
export const COLOR = {
    canvas: PRIMITIVE.gray50,
    surface: PRIMITIVE.white,
    sunken: PRIMITIVE.gray50,
    hover: PRIMITIVE.gray100,

    line: PRIMITIVE.gray200,
    lineStrong: PRIMITIVE.gray420,

    ink: PRIMITIVE.gray900,
    inkSecondary: PRIMITIVE.gray700,
    inkMuted: PRIMITIVE.gray600,
    inkInverse: PRIMITIVE.white,

    accent: PRIMITIVE.blue900,
    accentHover: PRIMITIVE.blue1000,
    accentSubtle: PRIMITIVE.blue50,
    accentLine: PRIMITIVE.blue200,

    positive: PRIMITIVE.green800,
    caution: PRIMITIVE.orange900,
    critical: PRIMITIVE.red900,
};

/**
 * グラフの系列色。
 *
 * ガイドブックの指針に合わせ、意味で使い分ける。
 * - primary   主に見せたい系列。これ1色で足りるならこれだけ使う
 * - secondary 補助の系列
 * - tertiary  基準線・目標など、実績と対比させたいもの
 * - neutral   比較対象、または「未設定」など意味を持たない区分
 *
 * 系列は最大3色まで。それ以上必要になったらグラフを分ける。
 * primary(青) と tertiary(オレンジ) は P型・D型色覚でも明度差が残る組み合わせ。
 */
export const SERIES = {
    primary: PRIMITIVE.blue900,
    primarySoft: 'rgba(0, 23, 193, 0.08)',
    secondary: PRIMITIVE.cyan1000,
    tertiary: PRIMITIVE.orange800,
    neutral: PRIMITIVE.gray500,
};

/**
 * 順序のある量を表す濃淡（sequential）。
 * 色相は青のまま変えず、濃さだけで大小を示す。
 * 大小に色相を割り当てると（青→黄→赤など）、量の順序が読めなくなる。
 */
export const HEAT = [
    PRIMITIVE.blue50,
    PRIMITIVE.blue200,
    PRIMITIVE.blue400,
    PRIMITIVE.blue700,
    PRIMITIVE.blue1000,
];

/**
 * 濃淡セルの上に載せる文字色。
 * 背景が濃い段階だけ白に反転させ、どの段階でも 4.5:1 を確保する。
 */
export function heatInk(step) {
    return step >= 3 ? COLOR.inkInverse : COLOR.ink;
}

/** グラフの目盛り・グリッドの体裁。Chart.js の既定値に流し込む */
export const AXIS = {
    tick: COLOR.inkSecondary,
    grid: PRIMITIVE.gray100,
    border: COLOR.line,
};
