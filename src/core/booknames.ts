import type { BookNamesTable, LanguageCode } from "./types";
import de from "../../data/booknames/de.json";
import en from "../../data/booknames/en.json";
import es from "../../data/booknames/es.json";
import fr from "../../data/booknames/fr.json";
import it from "../../data/booknames/it.json";

export const BOOK_NAMES: Record<LanguageCode, BookNamesTable> = { de, en, es, fr, it };
