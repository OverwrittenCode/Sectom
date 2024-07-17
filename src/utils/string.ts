import crypto from "node:crypto";

import { ActionType } from "@prisma/client";

import type { Typings } from "~/ts/Typings.js";

import type { PascalCase, Split } from "type-fest";
import type { SplitWords } from "type-fest/source/split-words.js";

export abstract class StringUtils {
	public static LineBreak = "\n" as const;
	public static FieldNameSeparator = ":" as const;
	public static CustomIDFIeldBodySeperator = "." as const;
	public static CustomIDFieldPrefixSeperator = "_" as const;
	public static TabCharacter = "⠀" as const;

	public static Regexes = {
		Snowflake: /^\d{17,20}$/,
		HexCode: /^[0-9A-F]{6}$/i,
		CamelCaseBoundary: /([a-z])([A-Z])/g,
		Link: /(https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z]{2,}(\.[a-zA-Z]{2,})(\.[a-zA-Z]{2,})?\/[a-zA-Z0-9]{2,}|((https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z]{2,}(\.[a-zA-Z]{2,})(\.[a-zA-Z]{2,})?)|(https:\/\/www\.|http:\/\/www\.|https:\/\/|http:\/\/)?[a-zA-Z0-9]{2,}\.[a-zA-Z0-9]{2,}\.[a-zA-Z0-9]{2,}(\.[a-zA-Z0-9]{2,})?/,
		Invite: /(https?:\/\/)?(www\.|canary\.|ptb\.)?discord(\.gg|(app)?\.com\/invite|\.me)\/([^ ]+)\/?/gi,
		BotInvite: /(https?:\/\/)?(www\.|canary\.|ptb\.)?discord(app)?\.com\/(api\/)?oauth2\/authorize\?([^ ]+)\/?/gi,

		UnicodeEmoji:
			/((\ud83c[\udde6-\uddff]){2}|([#*0-9]\u20e3)|(\u00a9|\u00ae|[\u2000-\u3300]|[\ud83c-\ud83e][\ud000-\udfff])((\ud83c[\udffb-\udfff])?(\ud83e[\uddb0-\uddb3])?(\ufe0f?\u200d([\u2000-\u3300]|[\ud83c-\ud83e][\ud000-\udfff])\ufe0f?)?)*)/g,

		Number: /^\d+$/,
		AllActionModifiers: new RegExp(
			`_(${Array.from(
				new Set<string>(Object.values(ActionType).map((actionType) => actionType.split("_").at(-1)!))
			).join("|")})$`,
			"g"
		),
		CreateBasedActionModifiers: /_(ADD|CREATE|SET)$/g
	} as const;

	public static isValidString(str: any): str is string {
		return !!str && typeof str === "string";
	}

	public static capitaliseFirstLetter<const T extends string>(str: T): Capitalize<T> {
		const value = str.charAt(0).toUpperCase() + str.slice(1);
		return value as Capitalize<T>;
	}
	public static convertToTitleCase<const T extends string, const S extends string = " ">(
		str: T,
		splitBy?: S
	): Split<T, S> extends SplitWords<T> ? Typings.Concatenate<SplitWords<PascalCase<Lowercase<T>>>, " "> : string {
		return str
			.replace(this.Regexes.CamelCaseBoundary, "$1 $2")
			.toLowerCase()
			.split(splitBy || " ")
			.map(this.capitaliseFirstLetter)
			.join(" ") as Typings.Concatenate<SplitWords<PascalCase<Lowercase<T>>>, " ">;
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
