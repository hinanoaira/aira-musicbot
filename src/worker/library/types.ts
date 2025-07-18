import { LibraryData } from "../../types/index.js";

export interface LibraryParseResult {
  success: boolean;
  data?: LibraryData;
  error?: string;
}

export interface LibraryParserConfig {
  xmlPath: string;
  pathPrefix: string;
}
