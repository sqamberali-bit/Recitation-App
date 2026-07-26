/**
 * Best-effort Urdu → Roman transliteration. Urdu omits most short vowels, so a
 * character-level scheme can only approximate pronunciation — this is offered
 * as an optional aid, not a definitive romanisation. The mapping is isolated
 * here so it can later be swapped for a statistical/AI transliterator.
 */

const MAP: Record<string, string> = {
  ا: 'a', آ: 'aa', أ: 'a', إ: 'i', ء: "'",
  // Hamza carriers — without these they fell through as raw Urdu letters.
  ؤ: "'o", ئ: "'e", ۓ: 'e', '\u0654': '', '\u0655': '',
  ب: 'b', پ: 'p', ت: 't', ٹ: 'ṭ', ث: 's',
  ج: 'j', چ: 'ch', ح: 'h', خ: 'kh',
  د: 'd', ڈ: 'ḍ', ذ: 'z', ر: 'r', ڑ: 'ṛ', ز: 'z', ژ: 'zh',
  س: 's', ش: 'sh', ص: 's', ض: 'z', ط: 't', ظ: 'z',
  ع: "'", غ: 'gh', ف: 'f', ق: 'q',
  ک: 'k', ك: 'k', گ: 'g', ل: 'l', م: 'm', ن: 'n', ں: 'n̠',
  و: 'o', ہ: 'h', ھ: 'h', ة: 'h', ه: 'h', ۀ: 'h', ۂ: 'h', ۃ: 'h',
  ی: 'y', ي: 'y', ے: 'e', ى: 'a',
  // Digits
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
}

// Short-vowel diacritics -> vowels.
const DIACRITIC_MAP: Record<string, string> = {
  'َ': 'a', // zabar / fatha
  'ِ': 'i', // zer / kasra
  'ُ': 'u', // pesh / damma
  'ّ': '',  // shadda (gemination handled loosely)
  'ْ': '',  // jazm / sukun
  'ـ': '',  // tatweel
  'ٰ': 'a', // superscript alef
}

/** Transliterate Urdu/Arabic script to a rough Roman form. */
export function transliterate(text: string): string {
  let out = ''
  for (const ch of text.normalize('NFC')) {
    if (ch in DIACRITIC_MAP) {
      out += DIACRITIC_MAP[ch]
      continue
    }
    if (ch in MAP) {
      out += MAP[ch]
      continue
    }
    out += ch // whitespace, punctuation, Latin passthrough
  }
  // Tidy: collapse triple+ repeats and multiple spaces.
  return out.replace(/([a-z])\1{2,}/gi, '$1$1').replace(/[ \t]{2,}/g, ' ')
}
