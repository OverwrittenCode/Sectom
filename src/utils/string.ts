import crypto from "node:crypto";

import type { Typings } from "~/ts/Typings.js";

export abstract class StringUtils {
	public static LineBreak = "\n" as const;
	public static FieldNameSeparator = ":" as const;
	public static CustomIDFIeldBodySeperator = "." as const;
	public static CustomIDFieldPrefixSeperator = "_" as const;
	public static TabCharacter = "⠀" as const;

	public static Regexes = {
		Snowflake: /^\d{17,20}$/,
		HexCode: /^[0-9A-F]{6}$/i,
		Link: /(https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z]{2,}(\.[a-zA-Z]{2,})(\.[a-zA-Z]{2,})?\/[a-zA-Z0-9]{2,}|((https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z]{2,}(\.[a-zA-Z]{2,})(\.[a-zA-Z]{2,})?)|(https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z0-9]{2,}\.[a-zA-Z0-9]{2,}\.[a-zA-Z0-9]{2,}(\.[a-zA-Z0-9]{2,})?/,
		Invite: /(https?:\/\/)?(www\.|canary\.|ptb\.)?discord(\.gg|(app)?\.com\/invite|\.me)\/([^ ]+)\/?/gi,
		BotInvite: /(https?:\/\/)?(www\.|canary\.|ptb\.)?discord(app)?\.com\/(api\/)?oauth2\/authorize\?([^ ]+)\/?/gi,

		UnicodeEmoji:
			/((\ud83c[\udde6-\uddff]){2}|([#*0-9]\u20e3)|(\u00a9|\u00ae|[\u2000-\u3300]|[\ud83c-\ud83e][\ud000-\udfff])((\ud83c[\udffb-\udfff])?(\ud83e[\uddb0-\uddb3])?(\ufe0f?\u200d([\u2000-\u3300]|[\ud83c-\ud83e][\ud000-\udfff])\ufe0f?)?)*)/g,

		Number: /^\d+$/,
		AllActionModifiers: /_(ENABLE|ADD|CREATE|SET|EDIT|UPDATE|RESET|REMOVE|CLOSE|DISABLE)$/g,
		CreateBasedActionModifiers: /_(ADD|CREATE|SET)$/g
	} as const;

	public static isValidString(str: any): str is string {
		return !!str && typeof str === "string";
	}

	public static capitaliseFirstLetter<const T extends string>(str: T): Typings.SentenceCase<T> {
		const value = str.charAt(0).toUpperCase() + str.slice(1);
		return value as Typings.SentenceCase<T>;
	}

	public static concatenate<const Seperator extends string, const T extends string[]>(
		seperator: Seperator,
		...strs: T
	): Typings.Concatenate<T, Seperator> {
		let result = "";
		for (let i = 0; i < strs.length; i++) {
			result += strs[i];
			if (i < strs.length - 1 && strs[i] !== "") {
				result += seperator;
			}
		}
		return result as Typings.Concatenate<T, Seperator>;
	}

	public static GenerateID(len: number | Buffer = 6, buf?: Buffer): string {
		if (Buffer.isBuffer(len)) {
			buf = len;
			len = 0;
		}

		if (!Buffer.isBuffer(buf)) {
			const numBytes = Math.ceil(Math.log(Math.pow(64, len)) / Math.log(2) / 8);
			buf = crypto.randomBytes(numBytes);
		}

		return buf.toString("hex").slice(0, len);
	}
}
