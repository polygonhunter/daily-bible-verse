import type { CuratedRefsFile } from "./types";
import curatedJson from "../../data/curated-refs.json";

export const CURATED: CuratedRefsFile = curatedJson as unknown as CuratedRefsFile;
