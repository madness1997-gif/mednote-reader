export type DictionaryMeaning = {
  partOfSpeech: string;
  definitions: string[];
};

export type DictionaryEntry = {
  word: string;
  phonetic: string | null;
  audioUrl: string | null;
  meanings: DictionaryMeaning[];
};

export type EnglishVietnameseLookup = {
  translation: string | null;
  alternatives: string[];
  dictionary: DictionaryEntry | null;
  translationError: string | null;
};

type FreeDictionaryResponse = Array<{
  word?: string;
  phonetic?: string;
  phonetics?: Array<{ text?: string; audio?: string }>;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string }>;
  }>;
}>;

type MyMemoryResponse = {
  responseStatus?: number | string;
  responseDetails?: string;
  responseData?: { translatedText?: string };
  matches?: Array<{ translation?: string; quality?: number | string }>;
};

const MAX_TRANSLATION_CHARACTERS = 500;

function dictionaryHeadword(text: string) {
  const normalized = text.trim().replace(/[’]/g, "'");
  return /^[A-Za-z][A-Za-z'-]*$/.test(normalized) ? normalized.toLocaleLowerCase("en") : null;
}

function uniqueUsefulTranslations(values: Array<string | undefined>, source: string) {
  const normalizedSource = source.trim().toLocaleLowerCase();
  return [...new Set(values
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value) && value!.toLocaleLowerCase() !== normalizedSource))]
    .slice(0, 4);
}

async function lookupOpenEnglishDictionary(word: string, signal: AbortSignal): Promise<DictionaryEntry | null> {
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Không mở được dữ liệu từ điển.");
  const entries = await response.json() as FreeDictionaryResponse;
  const entry = entries[0];
  if (!entry) return null;
  const phonetics = entry.phonetics ?? [];
  const meanings = (entry.meanings ?? [])
    .map((meaning) => ({
      partOfSpeech: meaning.partOfSpeech?.trim() || "Từ",
      definitions: (meaning.definitions ?? [])
        .map((definition) => definition.definition?.trim())
        .filter((definition): definition is string => Boolean(definition))
        .slice(0, 2),
    }))
    .filter((meaning) => meaning.definitions.length)
    .slice(0, 3);
  return {
    word: entry.word?.trim() || word,
    phonetic: entry.phonetic?.trim() || phonetics.find((item) => item.text)?.text?.trim() || null,
    audioUrl: phonetics.find((item) => item.audio)?.audio?.trim() || null,
    meanings,
  };
}

async function translateEnglishToVietnamese(text: string, signal: AbortSignal) {
  if (text.length > MAX_TRANSLATION_CHARACTERS) {
    throw new Error(`Đoạn chọn dài hơn ${MAX_TRANSLATION_CHARACTERS} ký tự. Hãy chọn một câu ngắn hơn để nhận gợi ý.`);
  }
  const query = new URLSearchParams({ q: text, langpair: "en|vi" });
  const response = await fetch(`https://api.mymemory.translated.net/get?${query.toString()}`, { signal });
  if (!response.ok) throw new Error("Dịch vụ gợi ý dịch chưa phản hồi.");
  const payload = await response.json() as MyMemoryResponse;
  if (Number(payload.responseStatus ?? 200) !== 200) {
    throw new Error(payload.responseDetails?.trim() || "Không tìm thấy bản dịch phù hợp.");
  }
  const rankedMatches = [...(payload.matches ?? [])].sort((a, b) => Number(b.quality ?? 0) - Number(a.quality ?? 0));
  const suggestions = uniqueUsefulTranslations([
    payload.responseData?.translatedText,
    ...rankedMatches.map((match) => match.translation),
  ], text);
  return { translation: suggestions[0] ?? null, alternatives: suggestions.slice(1) };
}

export async function lookupEnglishVietnamese(text: string, signal: AbortSignal): Promise<EnglishVietnameseLookup> {
  const source = text.replace(/\s+/g, " ").trim();
  const headword = dictionaryHeadword(source);
  const [translationResult, dictionaryResult] = await Promise.allSettled([
    translateEnglishToVietnamese(source, signal),
    headword ? lookupOpenEnglishDictionary(headword, signal) : Promise.resolve(null),
  ]);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const translation = translationResult.status === "fulfilled" ? translationResult.value : { translation: null, alternatives: [] };
  return {
    ...translation,
    dictionary: dictionaryResult.status === "fulfilled" ? dictionaryResult.value : null,
    translationError: translationResult.status === "rejected"
      ? translationResult.reason instanceof Error ? translationResult.reason.message : "Chưa thể tạo gợi ý dịch."
      : null,
  };
}

export function oxfordLookupUrl(text: string) {
  return `https://www.oxfordlearnersdictionaries.com/search/english/?q=${encodeURIComponent(text.trim())}`;
}
