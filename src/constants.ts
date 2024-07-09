import { dirname } from "path";
import { fileURLToPath } from "url";

export const GUILD_IDS = ["944311981261881454"];
export const BOT_ID = "1020681119072518264";

export const MAX_EMBED_DESCRIPTION_LENGTH = 2048;
export const MAX_COMMAND_DESCRIPTION_LENGTH = 100;
export const MAX_REASON_STRING_LENGTH = 450;
export const MAX_MESSAGE_FETCH_LIMIT = 100;
export const MAX_PURGE_COUNT_LIMIT = 1000;
export const MAX_AUTOCOMPLETE_OPTION_LIMIT = 25;
export const MAX_ACTIVE_THREAD_LIMIT = 1000;
export const MAX_ELEMENTS_PER_PAGE = 10;
export const MAX_DEFER_RESPONSE_WAIT = 2500;

export const LIGHT_GOLD = 0xe6c866;

export const SRC_PATH = dirname(fileURLToPath(import.meta.url)).replaceAll("\\", "/");
