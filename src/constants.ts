import { EntityType } from "@prisma/client";

export const GUILD_IDS = ["944311981261881454"];
export const BOT_ID = "1020681119072518264";

export const MAX_EMBED_DESCRIPTION_LENGTH = 2048;
export const MAX_COMMAND_DESCRIPTION_LENGTH = 100;
export const MAX_MESSAGE_FETCH_LIMIT = 100;
export const MAX_PURGE_COUNT_LIMIT = 1000;
export const MAX_DEFER_RESPONSE_WAIT = 2500;
export const DEFAULT_MESSAGE_FETCH_LIMIT = 50;

export const LIGHT_GOLD = 0xe6c866;

export const CASE_ID_LENGTH = 6;

export const NO_DATA_MESSAGE = "Nothing to view yet in this query selection.";
export const NO_REASON = "No reason provided.";

export const LINE_BREAK = "\n";
export const FIELD_NAME_SEPARATOR = ":";
export const TAB_CHARACTER = "⠀";

export const INTERACTION = {
	ID: {
		CANCEL_ACTION: {
			BUTTON_SUFFIX: "cancel_action",
			TITLE: "Cancelled",
			DESCRIPTION: "Action cancelled."
		},
		EXTERNALS: {
			WILD_CARDS: ["pagination"]
		}
	}
} as const;

export const COMMAND_OPTION_NAME_CHANNEL_PERMISSION = "in_channel" as const;
export const COMMAND_ENTITY_TYPE = { ...EntityType, SNOWFLAKE: "SNOWFLAKE" as const };

export const BUTTON_SUFFIX_CANCEL_ACTION = INTERACTION.ID.CANCEL_ACTION.BUTTON_SUFFIX;
export const BUTTON_SUFFIX_CONFIRM_ACTION = "confirm_action" as const;
export const BUTTON_SUFFIX_CONFIRMATION_ARRAY = [BUTTON_SUFFIX_CANCEL_ACTION, BUTTON_SUFFIX_CONFIRM_ACTION] as const;

export const SNOWFLAKE_REGEX = /^\d{17,20}$/;
export const LINK_REGEX =
	/(https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z]{2,}(\.[a-zA-Z]{2,})(\.[a-zA-Z]{2,})?\/[a-zA-Z0-9]{2,}|((https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z]{2,}(\.[a-zA-Z]{2,})(\.[a-zA-Z]{2,})?)|(https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z0-9]{2,}\.[a-zA-Z0-9]{2,}\.[a-zA-Z0-9]{2,}(\.[a-zA-Z0-9]{2,})?/;
export const INVITE_REGEX = /(https?:\/\/)?(www\.|canary\.|ptb\.)?discord(\.gg|(app)?\.com\/invite|\.me)\/([^ ]+)\/?/gi;
export const BOT_INVITE_REGEX =
	/(https?:\/\/)?(www\.|canary\.|ptb\.)?discord(app)?\.com\/(api\/)?oauth2\/authorize\?([^ ]+)\/?/gi;

export const UNICODE_EMOJI_REGEX =
	/((\ud83c[\udde6-\uddff]){2}|([#*0-9]\u20e3)|(\u00a9|\u00ae|[\u2000-\u3300]|[\ud83c-\ud83e][\ud000-\udfff])((\ud83c[\udffb-\udfff])?(\ud83e[\uddb0-\uddb3])?(\ufe0f?\u200d([\u2000-\u3300]|[\ud83c-\ud83e][\ud000-\udfff])\ufe0f?)?)*)/g;
